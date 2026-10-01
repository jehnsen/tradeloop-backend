import { IsDate, IsOptional } from 'class-validator';
import { toDate } from '../../common/http/dto';

export class BillingSummaryQueryDto {
  @IsOptional()
  @toDate()
  @IsDate()
  from?: Date;

  @IsOptional()
  @toDate()
  @IsDate()
  to?: Date;
}
