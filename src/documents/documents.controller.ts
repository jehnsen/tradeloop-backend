import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { TenantContext } from '../common/auth/auth-context';
import { Roles, Tenant } from '../common/auth/decorators';
import { Role, RoleGroups } from '../common/enums';
import { DocumentEntityType, DocumentType } from './document.entity';
import { DocumentsService, UploadedFileLike } from './documents.service';
import { DocumentQueryDto, UploadDocumentDto } from './dto/document.dto';
import { ALLOWED_MIME_TYPES } from './file-validation';

const UPLOADERS = [...RoleGroups.DISPATCH, Role.DRIVER, Role.FINANCE];

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Post()
  @Roles(...UPLOADERS)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: `Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
    schema: {
      type: 'object',
      required: ['file', 'entityType', 'entityId', 'type'],
      properties: {
        file: { type: 'string', format: 'binary' },
        entityType: { type: 'string', enum: Object.values(DocumentEntityType) },
        entityId: { type: 'string', format: 'uuid' },
        type: { type: 'string', enum: Object.values(DocumentType) },
      },
    },
  })
  upload(
    @Tenant() ctx: TenantContext,
    @UploadedFile() file: UploadedFileLike | undefined,
    @Body() dto: UploadDocumentDto,
  ) {
    return this.documents.upload(ctx, file, dto);
  }

  @Get()
  list(@Tenant() ctx: TenantContext, @Query() query: DocumentQueryDto) {
    return this.documents.list(ctx, query);
  }

  @Get(':id')
  async get(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    const { storageKey: _key, ...doc } = await this.documents.get(ctx, id);
    return doc;
  }

  @Get(':id/download')
  download(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.download(ctx, id);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles(...RoleGroups.OPERATIONS, Role.FINANCE)
  remove(@Tenant() ctx: TenantContext, @Param('id', ParseUUIDPipe) id: string) {
    return this.documents.remove(ctx, id);
  }
}
