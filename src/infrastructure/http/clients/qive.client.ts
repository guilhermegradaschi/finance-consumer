import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { CircuitBreakerFactory } from '../circuit-breaker.factory';
import CircuitBreaker = require('opossum');

export interface QiveNfResponse {
  count: number;
  data: Array<{ access_key: string; xml: string }>;
  page: { next: string | null };
}

export interface QiveEventResponse {
  data: Array<{ access_key: string; type: string; xml: string }>;
  page: { next: string | null };
}

@Injectable()
export class QiveClient implements OnModuleInit {
  private readonly logger = new Logger(QiveClient.name);
  private apiUrl!: string;
  private apiKey!: string;
  private apiId!: string;
  private breaker!: CircuitBreaker<[string], QiveNfResponse>;
  private eventBreaker!: CircuitBreaker<[string], QiveEventResponse>;

  constructor(
    private readonly configService: ConfigService,
    private readonly httpService: HttpService,
    private readonly cbFactory: CircuitBreakerFactory,
  ) {}

  onModuleInit(): void {
    this.apiUrl = this.configService.get<string>('QIVE_API_URL', '');
    this.apiKey = this.configService.get<string>('QIVE_API_KEY', '');
    this.apiId = this.configService.get<string>('QIVE_API_ID', '');

    this.breaker = this.cbFactory.create('qive-nfe', (url: string) => this.doFetchNfe(url));
    this.eventBreaker = this.cbFactory.create('qive-events', (url: string) => this.doFetchEvents(url));
  }

  private get headers(): Record<string, string> {
    return {
      'X-API-KEY': this.apiKey,
      'X-API-ID': this.apiId,
      'Content-Type': 'application/json',
    };
  }

  async fetchAuthorizedNfes(from: string, to: string): Promise<QiveNfResponse[]> {
    const allPages: QiveNfResponse[] = [];
    let url = `${this.apiUrl}/nfe/authorized?limit=50&created_at[from]=${encodeURIComponent(from)}&created_at[to]=${encodeURIComponent(to)}`;

    while (url) {
      this.logger.log(`Fetching Qive NFes: ${url}`);
      const response = await this.breaker.fire(url);
      allPages.push(response);

      if (response.count > 49 && response.page?.next) {
        const nextUrl = new URL(response.page.next);
        const cursor = nextUrl.searchParams.get('cursor');
        url = cursor
          ? `${this.apiUrl}/nfe/authorized?limit=50&cursor=${cursor}&created_at[from]=${encodeURIComponent(from)}&created_at[to]=${encodeURIComponent(to)}`
          : '';
      } else {
        url = '';
      }
    }

    return allPages;
  }

  async fetchCancellationEvents(cursor?: string): Promise<QiveEventResponse[]> {
    const allPages: QiveEventResponse[] = [];
    let url = `${this.apiUrl}/events/nfe?limit=50&type=110111,110112`;
    if (cursor) url += `&cursor=${cursor}`;

    while (url) {
      this.logger.log(`Fetching Qive cancellation events: cursor=${cursor ?? 'none'}`);
      const response = await this.eventBreaker.fire(url);
      allPages.push(response);

      if (response.page?.next) {
        const nextUrl = new URL(response.page.next);
        const nextCursor = nextUrl.searchParams.get('cursor');
        url = nextCursor
          ? `${this.apiUrl}/events/nfe?limit=50&type=110111,110112&cursor=${nextCursor}`
          : '';
      } else {
        url = '';
      }
    }

    return allPages;
  }

  private async doFetchNfe(url: string): Promise<QiveNfResponse> {
    const { data } = await firstValueFrom(
      this.httpService.get<QiveNfResponse>(url, { headers: this.headers }),
    );
    return data;
  }

  private async doFetchEvents(url: string): Promise<QiveEventResponse> {
    const { data } = await firstValueFrom(
      this.httpService.get<QiveEventResponse>(url, { headers: this.headers }),
    );
    return data;
  }
}
