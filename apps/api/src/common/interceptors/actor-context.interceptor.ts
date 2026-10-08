import { CallHandler, ExecutionContext, Injectable, NestInterceptor } from "@nestjs/common";
import { runWithActor } from "@medcal/db";
import { Observable } from "rxjs";

/**
 * Binds the authenticated actor (request.userId, set by CompanyRoleGuard — never
 * a client value) to the async context of the handler, so the Prisma
 * updated-by extension stamps updatedByUserId on every update the request makes
 * (services, nested calls, $transaction callbacks). Guards run before
 * interceptors, so request.userId is already resolved here. Routes without that
 * guard (public / customer-portal / webhook) run with no actor: updatedByUserId
 * is left untouched.
 */
@Injectable()
export class ActorContextInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() !== "http") return next.handle();
    const userId = context.switchToHttp().getRequest().userId as string | undefined;
    if (!userId) return next.handle();
    return new Observable((subscriber) =>
      runWithActor(userId, () => next.handle().subscribe(subscriber)),
    );
  }
}
