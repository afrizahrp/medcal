import { createParamDecorator, ExecutionContext } from "@nestjs/common";

/** Session user id resolved by CompanyRoleGuard — never from a client body. */
export const UserId = createParamDecorator((_data: unknown, ctx: ExecutionContext): string => {
  const request = ctx.switchToHttp().getRequest();
  return request.userId;
});
