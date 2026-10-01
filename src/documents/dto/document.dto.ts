import { IsEnum, IsUUID } from 'class-validator';
import { PaginationQueryDto } from '../../common/http/pagination';
import { DocumentEntityType, DocumentType } from '../document.entity';

export class UploadDocumentDto {
  @IsEnum(DocumentEntityType)
  entityType: DocumentEntityType;

  @IsUUID()
  entityId: string;

  @IsEnum(DocumentType)
  type: DocumentType;
}

export class DocumentQueryDto extends PaginationQueryDto {
  @IsEnum(DocumentEntityType)
  entityType: DocumentEntityType;

  @IsUUID()
  entityId: string;
}
