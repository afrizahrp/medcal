import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  customerCreateSchema,
  customerListQuerySchema,
  customerUpdateSchema,
} from "@medcal/shared";
import { CompanyId } from "../../common/decorators/company-id.decorator";
import { RequirePermission } from "../../common/decorators/require-permission.decorator";
import { CompanyRoleGuard } from "../../common/guards/company-role.guard";
import {
  CustomersService,
  type CustomerListResult,
  type CustomerWithContacts,
} from "./customers.service";

@Controller("customers")
@UseGuards(CompanyRoleGuard)
export class CustomersController {
  constructor(
    @Inject(CustomersService)
    private readonly service: CustomersService,
  ) {}

  @Post()
  @RequirePermission("customer", "create")
  async create(
    @CompanyId() companyId: string,
    @Body() rawBody: unknown,
  ): Promise<CustomerWithContacts> {
    const parsed = customerCreateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid customer payload",
        code: "INVALID_CUSTOMER",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.createCustomer(companyId, parsed.data);
  }

  @Get()
  @RequirePermission("customer", "read")
  async list(
    @CompanyId() companyId: string,
    @Query() rawQuery: unknown,
  ): Promise<CustomerListResult> {
    const parsed = customerListQuerySchema.safeParse(rawQuery);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid customer list query",
        code: "INVALID_CUSTOMER_QUERY",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.findAll(companyId, parsed.data);
  }

  @Get(":id")
  @RequirePermission("customer", "read")
  async findOne(
    @CompanyId() companyId: string,
    @Param("id") id: string,
  ): Promise<CustomerWithContacts> {
    return this.service.findOne(companyId, id);
  }

  @Patch(":id")
  @RequirePermission("customer", "update")
  async update(
    @CompanyId() companyId: string,
    @Param("id") id: string,
    @Body() rawBody: unknown,
  ): Promise<CustomerWithContacts> {
    const parsed = customerUpdateSchema.safeParse(rawBody);
    if (!parsed.success) {
      throw new BadRequestException({
        message: "Invalid customer update",
        code: "INVALID_CUSTOMER_UPDATE",
        issues: parsed.error.flatten(),
      });
    }
    return this.service.update(companyId, id, parsed.data);
  }
}
