export interface WhoopConfig {
  email?: string;
  password?: string;
  baseUrl?: string;
}

interface TokenData {
  accessToken: string;
  expiresAt: number;
  userId?: string;
  accountId?: string;
}

export class WhoopClient {
  private config: WhoopConfig;
  private baseUrl: string;
  private tokenData: TokenData | null = null;

  constructor(config: WhoopConfig) {
    this.config = config;
    this.baseUrl = config.baseUrl || "https://api.prod.whoop.com";
  }

  // ─── Auth ────────────────────────────────────────────────────

  async login(): Promise<void> {
    const email = this.config.email;
    const password = this.config.password;
    if (!email || !password) throw new Error("Email and password required");

    const resp = await fetch(`${this.baseUrl}/auth-service/v3/whoop`, {
      method: "POST",
      headers: {
        Host: "api.prod.whoop.com",
        Accept: "*/*",
        "Content-Type": "application/x-amz-json-1.1",
        "X-Amz-Target": "AWSCognitoIdentityProviderService.InitiateAuth",
        "User-Agent": "WHOOP/5.430.0 (iOS; 17.0)",
      },
      body: JSON.stringify({
        AuthParameters: { USERNAME: email, PASSWORD: password },
        ClientId: "37365lrcda1js3fapqfe2n40eh",
        AuthFlow: "USER_PASSWORD_AUTH",
      }),
    });

    if (!resp.ok) throw new Error(`Login failed: ${resp.status}`);

    const data = await resp.json() as any;
    const authResult = data.AuthenticationResult;
    if (!authResult) throw new Error("No auth result");

    // Extract userId from JWT
    let userId: string | undefined;
    let accountId: string | undefined;
    try {
      const payload = JSON.parse(
        Buffer.from(authResult.AccessToken.split(".")[1], "base64").toString()
      );
      userId = payload["custom:user_id"];
      accountId = payload["custom:account_id"];
    } catch {}

    this.tokenData = {
      accessToken: authResult.AccessToken,
      expiresAt: Date.now() + authResult.ExpiresIn * 1000,
      userId,
      accountId,
    };
  }

  private async ensureToken(): Promise<void> {
    if (!this.tokenData || this.tokenData.expiresAt - Date.now() < 5 * 60 * 1000) {
      await this.login();
    }
  }

  get userId(): string {
    return this.tokenData?.userId || "";
  }

  // ─── HTTP ────────────────────────────────────────────────────

  private async request<T = any>(path: string, retried = false): Promise<T> {
    await this.ensureToken();

    const resp = await fetch(`${this.baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.tokenData!.accessToken}`,
        Host: "api.prod.whoop.com",
        Accept: "*/*",
        "User-Agent": "WHOOP/5.430.0 (iOS; 17.0)",
        "Content-Type": "application/json",
        "X-WHOOP-Device-Platform": "iOS",
        "X-WHOOP-Time-Zone": Intl.DateTimeFormat().resolvedOptions().timeZone,
        Locale: "en_US",
      },
    });

    if (resp.status === 401 && !retried) {
      await this.login();
      return this.request<T>(path, true);
    }

    if (!resp.ok) throw new Error(`WHOOP API ${resp.status}: ${path}`);
    return resp.json() as Promise<T>;
  }

  // ─── Paginated fetch helper for developer v2 endpoints ──────

  private async fetchPaginated<T>(basePath: string, limit: number): Promise<T[]> {
    const all: T[] = [];
    let nextToken: string | undefined;

    while (all.length < limit) {
      const batchSize = Math.min(limit - all.length, 25);
      let path = `${basePath}${basePath.includes("?") ? "&" : "?"}limit=${batchSize}`;
      if (nextToken) path += `&nextToken=${encodeURIComponent(nextToken)}`;

      const data = await this.request<{ records: T[]; next_token?: string }>(path);
      all.push(...(data.records || []));

      if (!data.next_token || data.records.length === 0) break;
      nextToken = data.next_token;
    }

    return all.slice(0, limit);
  }

  // ─── Internal App API ────────────────────────────────────────

  async getHome(date: string): Promise<any> {
    return this.request(`/home-service/v1/home?date=${date}`);
  }

  async getDeepDiveSleep(date: string): Promise<any> {
    return this.request(`/home-service/v1/deep-dive/sleep?date=${date}`);
  }

  async getDeepDiveRecovery(date: string): Promise<any> {
    return this.request(`/home-service/v1/deep-dive/recovery?date=${date}`);
  }

  async getDeepDiveStrain(date: string): Promise<any> {
    return this.request(`/home-service/v1/deep-dive/strain?date=${date}`);
  }

  async getSleepLastNight(date: string): Promise<any> {
    return this.request(`/home-service/v1/deep-dive/sleep/last-night?date=${date}`);
  }

  async getWidgetOverview(): Promise<any> {
    return this.request("/home-service/v1/widget/overview");
  }

  async getRecoveryCalendar(date: string): Promise<any> {
    return this.request(`/home-service/v1/calendar/recovery?date=${date}`);
  }

  async getHealthspan(date: string): Promise<any> {
    return this.request(`/healthspan-service/v1/healthspan/bff?date=${date}`);
  }

  async getHealthTab(): Promise<any> {
    return this.request("/health-tab-bff/v1/health-tab");
  }

  async getBehaviorImpact(): Promise<any> {
    return this.request("/behavior-impact-service/v1/impact");
  }

  async getSleepNeed(): Promise<any> {
    return this.request("/coaching-service/v2/sleepneed");
  }

  // ─── Developer v2 API (structured, paginated) ───────────────

  async getRecoveryV2(limit: number = 7): Promise<any[]> {
    return this.fetchPaginated("/developer/v2/recovery", limit);
  }

  async getSleepV2(limit: number = 7): Promise<any[]> {
    return this.fetchPaginated("/developer/v2/activity/sleep", limit);
  }

  async getWorkoutsV2(limit: number = 7): Promise<any[]> {
    return this.fetchPaginated("/developer/v2/activity/workout", limit);
  }

  async getCyclesV2(limit: number = 7): Promise<any[]> {
    return this.fetchPaginated("/developer/v2/cycle", limit);
  }

  // ─── Static data ─────────────────────────────────────────────

  async getBodyMeasurements(): Promise<{ height_meter: number; weight_kilogram: number; max_heart_rate: number }> {
    return this.request("/developer/v1/user/measurement/body");
  }

  async getUserProfile(): Promise<{ user_id: number; email: string; first_name: string; last_name: string }> {
    return this.request("/developer/v1/user/profile/basic");
  }
}
