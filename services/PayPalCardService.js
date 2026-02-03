import fetch from "node-fetch";

const PAYPAL_API = "https://api-m.sandbox.paypal.com";

class PayPalCardService {
  constructor(clientId, clientSecret) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  async getAccessToken() {
    const response = await fetch(`${PAYPAL_API}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(
          `${this.clientId}:${this.clientSecret}`
        ).toString("base64")}`,
      },
      body: "grant_type=client_credentials",
    });
    const data = await response.json();
    return data.access_token;
  }

  async createCardPayment(amount, currency, cardDetails) {
    const accessToken = await this.getAccessToken();
    const response = await fetch(`${PAYPAL_API}/v2/payments/authorizations`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [
          {
            amount: {
              currency_code: currency,
              value: amount,
            },
            payment_instruction: {
              disbursement_mode: "INSTANT",
            },
          },
        ],
        payment_source: {
          card: cardDetails,
        },
      }),
    });
    return response.json();
  }
}

export default PayPalCardService;
