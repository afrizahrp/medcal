import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Session user email resolved by CompanyRoleGuard — used only for password re-auth (LK download). */
export const UserEmail = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.userEmail;
});
