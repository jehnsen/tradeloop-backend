import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
  StreamableFile,
} from '@nestjs/common';
import { map, Observable } from 'rxjs';
import { Paginated } from './pagination';

@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== 'http') return next.handle();
    return next.handle().pipe(
      map((result: unknown) => {
        if (result instanceof StreamableFile) return result;
        if (result instanceof Paginated) return { data: result.items, meta: result.meta };
        return { data: result ?? null, meta: {} };
      }),
    );
  }
}
