import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class PeriodStatusService {
  private readonly logger = new Logger(PeriodStatusService.name);

  /**
   * Adjusts reference_date to the next open period recursively.
   * In the finance-api, a period is "closed" via PeriodStatus records.
   * This consumer queries the same table or an equivalent API to determine
   * whether a given month is open for billing.
   *
   * For now, this stub returns the original date.
   * Full implementation requires access to the period_statuses table or API.
   */
  async adjustToOpenPeriod(date: Date, _sellerId: number): Promise<Date> {
    return this.findOpenPeriod(date, _sellerId, 0);
  }

  private async findOpenPeriod(date: Date, sellerId: number, depth: number): Promise<Date> {
    if (depth > 12) {
      this.logger.warn(`Max recursion reached for period adjustment: seller=${sellerId}`);
      return date;
    }

    const isOpen = await this.isPeriodOpen(date, sellerId);
    if (isOpen) return date;

    const nextMonth = new Date(date.getFullYear(), date.getMonth() + 1, 1);
    return this.findOpenPeriod(nextMonth, sellerId, depth + 1);
  }

  private async isPeriodOpen(_date: Date, _sellerId: number): Promise<boolean> {
    // TODO: Query period_statuses table or finance-api endpoint
    return true;
  }
}
