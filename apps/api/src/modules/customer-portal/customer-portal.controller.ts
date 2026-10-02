import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Post,
  Query,
  Req,
  StreamableFile,
  UnauthorizedException,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { fromNodeHeaders } from "better-auth/node";
import { auth } from "@medcal/auth";
import {
  customerFeedbackSubmitSchema,
  customerJobListQuerySchema,
  customerUnitGroupListQuerySchema,
  customerWorkOrderListQuerySchema,
} from "@medcal/shared";
import { TrustedOriginGuard } from "../../common/guards/trusted-origin.guard";
import {
  CustomerPortalService,
  type CustomerCertificateView,
  type CustomerFeedbackState,
  type CustomerFeedbackSummary,
  type CustomerJobView,
  type CustomerPage,
  type CustomerUnitGroupPage,
  type CustomerWorkOrderSummary,
} from "./customer-portal.service";

/**
 * Customer-scoped reads. Session-only at the guard layer (the global auth
 * guard already rejects anonymous callers); which Work Orders this session
 * may see is decided entirely inside CustomerPortalService from the user's
 * CustomerUserLink. There is no client-supplied customerId.
 */
async function sessionUserId(request: Request): Promise<string> {
  const session = await auth.api.getSession({ headers: fromNodeHeaders(request.headers) });
  if (!session) throw new UnauthorizedException();
  return session.user.id;
}

function requestContext(request: Request) {
  return {
    ipAddress: request.ip ?? null,
    userAgent: request.headers["user-agent"] ?? null,
  };
}

function invalidQuery(issues: unknown): BadRequestException {
  return new BadRequestException({
    message: "Invalid query",
    code: "INVALID_CUSTOMER_PORTAL_QUERY",
    issues,
  });
}

@Controller("customer/work-orders")
export class CustomerWorkOrdersController {
  constructor(@Inject(CustomerPortalService) private readonly portal: CustomerPortalService) {}

  @Get()
  async list(
    @Req() request: Request,
    @Query() rawQuery: unknown,
  ): Promise<CustomerPage<CustomerWorkOrderSummary>> {
    const parsed = customerWorkOrderListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidQuery(parsed.error.flatten());
    return this.portal.listWorkOrders(await sessionUserId(request), parsed.data);
  }

  @Get(":id/unit-groups")
  async unitGroups(
    @Param("id") id: string,
    @Req() request: Request,
    @Query() rawQuery: unknown,
  ): Promise<CustomerUnitGroupPage> {
    const parsed = customerUnitGroupListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidQuery(parsed.error.flatten());
    return this.portal.listUnitGroups(await sessionUserId(request), id, parsed.data);
  }

  @Get(":id/jobs")
  async jobs(
    @Param("id") id: string,
    @Req() request: Request,
    @Query() rawQuery: unknown,
  ): Promise<CustomerPage<CustomerJobView>> {
    const parsed = customerJobListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) throw invalidQuery(parsed.error.flatten());
    return this.portal.listJobs(await sessionUserId(request), id, parsed.data);
  }

  @Get(":id/feedback")
  async feedback(@Param("id") id: string, @Req() request: Request): Promise<CustomerFeedbackState> {
    return this.portal.getFeedback(await sessionUserId(request), id);
  }

  /** The portal's only customer write: cookie-authenticated, so the Origin must be a trusted one. */
  @Post(":id/feedback")
  @UseGuards(TrustedOriginGuard)
  async submitFeedback(
    @Param("id") id: string,
    @Req() request: Request,
    @Body() rawBody: unknown,
  ): Promise<CustomerFeedbackSummary> {
    const userId = await sessionUserId(request);
    const parsed = customerFeedbackSubmitSchema.safeParse(rawBody ?? {});
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid feedback",
        code: "INVALID_CUSTOMER_FEEDBACK",
        issues: parsed.error.flatten(),
      });
    }
    return this.portal.submitFeedback(userId, id, parsed.data, requestContext(request));
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() request: Request): Promise<CustomerWorkOrderSummary> {
    return this.portal.getWorkOrder(await sessionUserId(request), id);
  }
}

@Controller("customer/calibration-jobs")
export class CustomerCalibrationJobsController {
  constructor(@Inject(CustomerPortalService) private readonly portal: CustomerPortalService) {}

  @Get(":id/certificate/pdf")
  async pdf(@Param("id") id: string, @Req() request: Request): Promise<StreamableFile> {
    const { stream, mimeType, filename } = await this.portal.openCertificatePdf(
      await sessionUserId(request),
      id,
      requestContext(request),
    );
    return new StreamableFile(stream, { type: mimeType, disposition: `inline; filename="${filename}"` });
  }

  @Get(":id/certificate")
  async certificate(@Param("id") id: string, @Req() request: Request): Promise<CustomerCertificateView> {
    return this.portal.getCertificate(await sessionUserId(request), id);
  }

  @Get(":id")
  async detail(@Param("id") id: string, @Req() request: Request): Promise<CustomerJobView> {
    return this.portal.getJob(await sessionUserId(request), id);
  }
}
