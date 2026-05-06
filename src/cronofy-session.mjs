import Cronofy from "cronofy";

export class CronofySession {
  /** @type {string | undefined} */
  #dataCenter;
  /** @type {string} */
  #clientId;
  /** @type {string} */
  #clientSecret;
  /** @type {string} */
  #refreshToken;
  /** @type {string | undefined} */
  #accessToken;
  /** @type {number} */
  #accessExpiresAtMs = 0;

  /**
   * @param {{ clientId: string; clientSecret: string; refreshToken: string; dataCenter?: string }} cfg
   */
  constructor(cfg) {
    this.#clientId = cfg.clientId;
    this.#clientSecret = cfg.clientSecret;
    this.#refreshToken = cfg.refreshToken;
    this.#dataCenter = cfg.dataCenter;
  }

  #baseOpts() {
    return this.#dataCenter ? { data_center: this.#dataCenter } : {};
  }

  async #refresh() {
    const client = new Cronofy({
      client_id: this.#clientId,
      client_secret: this.#clientSecret,
      refresh_token: this.#refreshToken,
      ...this.#baseOpts()
    });

    const token = await client.refreshAccessToken();

    this.#accessToken = token.access_token;

    if (typeof token.refresh_token === "string" && token.refresh_token.trim())
      this.#refreshToken = token.refresh_token.trim();

    const ttl = typeof token.expires_in === "number" ? token.expires_in : 3600;

    this.#accessExpiresAtMs = Date.now() + Math.max(60, ttl - 120) * 1000;
  }

  async accessToken() {
    if (!this.#accessToken || Date.now() >= this.#accessExpiresAtMs)
      await this.#refresh();

    return this.#accessToken;
  }

  async client() {
    const access_token = await this.accessToken();

    return new Cronofy({
      access_token,
      ...this.#baseOpts()
    });
  }
}
