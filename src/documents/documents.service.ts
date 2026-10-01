import { randomUUID } from 'node:crypto';
import { Injectable, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { TenantContext } from '../common/auth/auth-context';
import { AppConfig } from '../common/config/configuration';
import { badRequest, forbidden, notFound } from '../common/http/app.exception';
import { paginate } from '../common/http/pagination';
import { Driver } from '../drivers/driver.entity';
import { Load } from '../loads/load.entity';
import { MarketplaceBooking } from '../marketplace/entities/marketplace-booking.entity';
import { Order } from '../orders/order.entity';
import { Shipment } from '../shipments/shipment.entity';
import { Trip } from '../trips/entities/trip.entity';
import { Vehicle } from '../vehicles/vehicle.entity';
import { Document, DocumentEntityType } from './document.entity';
import { DocumentQueryDto, UploadDocumentDto } from './dto/document.dto';
import { assertAllowedFile, EXTENSIONS, sanitizeFileName } from './file-validation';
import { StorageService } from './storage/storage.service';

const TENANT_ENTITIES: Record<
  Exclude<DocumentEntityType, DocumentEntityType.BOOKING>,
  EntityTarget<ObjectLiteral>
> = {
  [DocumentEntityType.ORDER]: Order,
  [DocumentEntityType.SHIPMENT]: Shipment,
  [DocumentEntityType.LOAD]: Load,
  [DocumentEntityType.TRIP]: Trip,
  [DocumentEntityType.VEHICLE]: Vehicle,
  [DocumentEntityType.DRIVER]: Driver,
};

export interface UploadedFileLike {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class DocumentsService {
  private readonly maxBytes: number;

  constructor(
    @InjectRepository(Document) private readonly repo: Repository<Document>,
    private readonly dataSource: DataSource,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
    config: ConfigService<AppConfig, true>,
  ) {
    this.maxBytes = config.get('storage', { infer: true }).maxUploadBytes;
  }

  async upload(ctx: TenantContext, file: UploadedFileLike | undefined, dto: UploadDocumentDto) {
    if (!file) throw badRequest('FILE_REQUIRED', 'Multipart field "file" is required');
    assertAllowedFile(file.mimetype, file.buffer, this.maxBytes);
    await this.assertEntityAccess(ctx, dto.entityType, dto.entityId);

    const now = new Date();
    const storageKey = `${ctx.organizationId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomUUID()}${EXTENSIONS[file.mimetype]}`;
    await this.storage.put(storageKey, file.buffer, file.mimetype);
    try {
      const saved = await this.repo.save(
        this.repo.create({
          organizationId: ctx.organizationId,
          entityType: dto.entityType,
          entityId: dto.entityId,
          type: dto.type,
          fileName: sanitizeFileName(file.originalname),
          mimeType: file.mimetype,
          size: file.buffer.length,
          storageKey,
          uploadedBy: ctx.userId,
        }),
      );
      await this.audit.record({
        action: 'document.uploaded',
        entityType: 'Document',
        entityId: saved.id,
        metadata: {
          entityType: dto.entityType,
          entityId: dto.entityId,
          type: dto.type,
          size: saved.size,
        },
      });
      const { storageKey: _key, ...view } = saved;
      return view;
    } catch (err) {
      await this.storage.delete(storageKey);
      throw err;
    }
  }

  async list(ctx: TenantContext, query: DocumentQueryDto) {
    await this.assertEntityAccess(ctx, query.entityType, query.entityId);
    const qb = this.repo
      .createQueryBuilder('d')
      .where('d.entityType = :type AND d.entityId = :id', {
        type: query.entityType,
        id: query.entityId,
      });
    // Booking documents (e.g. proof of delivery) are shared between shipper and carrier.
    if (query.entityType !== DocumentEntityType.BOOKING)
      qb.andWhere('d.organizationId = :org', { org: ctx.organizationId });
    return paginate(qb, query, { createdAt: 'd.createdAt' }, 'createdAt');
  }

  async get(ctx: TenantContext, id: string): Promise<Document> {
    const doc = await this.repo
      .createQueryBuilder('d')
      .addSelect('d.storageKey')
      .where('d.id = :id', { id })
      .getOne();
    if (!doc) throw notFound('Document');
    if (doc.organizationId !== ctx.organizationId) {
      const shared =
        doc.entityType === DocumentEntityType.BOOKING &&
        (await this.bookingInvolves(ctx.organizationId, doc.entityId));
      if (!shared) throw notFound('Document');
    }
    return doc;
  }

  async download(ctx: TenantContext, id: string): Promise<StreamableFile> {
    const doc = await this.get(ctx, id);
    const stream = await this.storage.getStream(doc.storageKey);
    return new StreamableFile(stream, {
      type: doc.mimeType,
      length: doc.size,
      disposition: `attachment; filename*=UTF-8''${encodeURIComponent(doc.fileName)}`,
    });
  }

  async remove(ctx: TenantContext, id: string): Promise<void> {
    const doc = await this.get(ctx, id);
    if (doc.organizationId !== ctx.organizationId)
      throw forbidden(
        'NOT_DOCUMENT_OWNER',
        'Only the uploading organization can delete this document',
      );
    await this.repo.softDelete({ id });
    await this.storage.delete(doc.storageKey);
    await this.audit.record({
      action: 'document.deleted',
      entityType: 'Document',
      entityId: id,
      metadata: { entityType: doc.entityType, entityId: doc.entityId, fileName: doc.fileName },
    });
  }

  private async assertEntityAccess(
    ctx: TenantContext,
    type: DocumentEntityType,
    entityId: string,
  ): Promise<void> {
    const ok =
      type === DocumentEntityType.BOOKING
        ? await this.bookingInvolves(ctx.organizationId, entityId)
        : await this.dataSource
            .getRepository(TENANT_ENTITIES[type])
            .exists({ where: { id: entityId, organizationId: ctx.organizationId } });
    if (!ok) throw notFound(type.charAt(0) + type.slice(1).toLowerCase());
  }

  private bookingInvolves(organizationId: string, bookingId: string): Promise<boolean> {
    return this.dataSource.getRepository(MarketplaceBooking).exists({
      where: [
        { id: bookingId, shipperOrganizationId: organizationId },
        { id: bookingId, carrierOrganizationId: organizationId },
      ],
    });
  }
}
