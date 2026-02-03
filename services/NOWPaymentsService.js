import fetch from "node-fetch";
import crypto from "crypto";

class NOWPaymentsService {
  constructor(apiKey, ipnKey) {
    this.apiKey = apiKey;
    this.ipnKey = ipnKey;
    this.baseUrl = "https://api.nowpayments.io/v1";
  }

  async createPayment(orderId, amount, currency = "usd", orderDescription = "Add Funds") {
    try {
      const response = await fetch(`${this.baseUrl}/payment`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: currency,
          pay_currency: "btc", // This is often just a placeholder if using a payment_url/invoice
          order_id: orderId,
          order_description: orderDescription,
          ipn_callback_url: `${process.env.BACKEND_URL || 'http://localhost:8080'}/api/v1/planpurchase/nowpayments-webhook`,
          success_url: `${process.env.FRONTEND_URL}/user/dashboard/client/fundsummary?status=success`,
          cancel_url: `${process.env.FRONTEND_URL}/user/dashboard/client/addfunds?status=cancel`,
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("NOWPayments createPayment error:", error);
      throw error;
    }
  }

  // Alternatively, creating an invoice is often better for "Add Funds" page
  async createInvoice(orderId, amount, currency = "usd", orderDescription = "Add Funds") {
    try {
      const response = await fetch(`${this.baseUrl}/invoice`, {
        method: "POST",
        headers: {
          "x-api-key": this.apiKey,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          price_amount: amount,
          price_currency: currency,
          order_id: orderId,
          order_description: orderDescription,
          ipn_callback_url: `${process.env.BACKEND_URL || 'http://localhost:8080'}/api/v1/planpurchase/nowpayments-webhook`,
          success_url: `${process.env.FRONTEND_URL}/user/dashboard/client/fundsummary?status=success`,
          cancel_url: `${process.env.FRONTEND_URL}/user/dashboard/client/addfunds?status=cancel`,
        }),
      });

      const data = await response.json();
      return data;
    } catch (error) {
      console.error("NOWPayments createInvoice error:", error);
      throw error;
    }
  }

  verifyIPN(payload, signature) {
    if (!this.ipnKey) {
        console.error("NOWPayments IPN Key is missing in .env");
        return false;
    }

    // Sort the payload alphabetically by keys
    const sortedPayload = Object.keys(payload)
      .sort()
      .reduce((obj, key) => {
        obj[key] = payload[key];
        return obj;
      }, {});

    const hmac = crypto.createHmac("sha512", this.ipnKey);
    hmac.update(JSON.stringify(sortedPayload));
    const expectedSignature = hmac.digest("hex");

    return expectedSignature === signature;
  }
}

export default NOWPaymentsService;
