import axios from "axios";

/**
 * LinkedInService
 * ----------------
 * Helper service that encapsulates LinkedIn OAuth HTTP calls.
 * - Exchanges an authorization code for an access token
 * - Fetches basic profile and primary email using LinkedIn REST APIs
 *
 * Environment variables expected (do NOT commit secrets to repo):
 * - process.env.LINKEDIN_CLIENT_ID
 * - process.env.LINKEDIN_CLIENT_SECRET
 * - process.env.LINKEDIN_REDIRECT_URI
 *
 * Notes:
 * - The redirect_uri provided here must exactly match the one
 *   registered in your LinkedIn app settings.
 */
const LINKEDIN_API_URL = "https://api.linkedin.com/v2";

class LinkedInService {
  async getLinkedInAccessToken(code) {
    try {
      // Clean and normalize redirect URI - must match frontend exactly
      let redirectUri = process.env.LINKEDIN_REDIRECT_URI;
      
      if (!redirectUri) {
        throw new Error("LINKEDIN_REDIRECT_URI is not set in environment variables");
      }
      
      // Remove trailing slashes and trim whitespace - must match frontend format exactly
      redirectUri = redirectUri.trim().replace(/\/+$/, "");
      
      // CRITICAL: Verify redirect URI matches expected format exactly
      const expectedUri = "http://localhost:3000/linkedin-callback";
      const uriMatch = redirectUri === expectedUri;
      
      // Debug: Log the redirect URI being used
      console.log("🔍 Backend LinkedIn OAuth Token Exchange - DETAILED DEBUG:");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      console.log("1. Redirect URI (raw from env):", JSON.stringify(process.env.LINKEDIN_REDIRECT_URI));
      console.log("2. Redirect URI (after cleaning):", JSON.stringify(redirectUri));
      console.log("3. Expected format (must match):", JSON.stringify(expectedUri));
      console.log("4. EXACT MATCH?", uriMatch ? "✅ YES" : "❌ NO");
      console.log("5. Length check:", {
        expected: expectedUri.length,
        actual: redirectUri.length,
        match: expectedUri.length === redirectUri.length
      });
      console.log("6. LinkedIn Client ID:", process.env.LINKEDIN_CLIENT_ID ? "✅ Set" : "❌ Missing");
      console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
      
      if (!uriMatch) {
        console.error("🚨 CRITICAL ERROR: Backend redirect URI does NOT match!");
        console.error("   Expected:", expectedUri);
        console.error("   Actual:", redirectUri);
        console.error("   → This will cause LinkedIn to reject the token exchange!");
        console.error("   → Fix server/.env file: LINKEDIN_REDIRECT_URI=" + expectedUri);
        
        // Find differences
        const differences = [];
        for (let i = 0; i < Math.max(expectedUri.length, redirectUri.length); i++) {
          if (expectedUri[i] !== redirectUri[i]) {
            differences.push({
              pos: i,
              expected: expectedUri[i] || '(end)',
              actual: redirectUri[i] || '(end)'
            });
          }
        }
        console.error("   Character differences:", differences);
      }
      
      const params = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        client_id: process.env.LINKEDIN_CLIENT_ID,
        client_secret: process.env.LINKEDIN_CLIENT_SECRET,
        redirect_uri: redirectUri, // Use cleaned URI
      });

      const response = await axios.post(
        "https://www.linkedin.com/oauth/v2/accessToken",
        params,
        { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
      );

      // response.data contains access_token, expires_in, etc.
      return response.data.access_token;
    } catch (error) {
      console.error(
        "Error getting LinkedIn access token:",
        error.response?.data || error.message
      );
      if (error.response?.data) {
        console.error("LinkedIn Error Details:", JSON.stringify(error.response.data, null, 2));
      }
      throw new Error("Failed to get LinkedIn access token");
    }
  }

  async getLinkedInProfile(accessToken) {
    try {
      const headers = {
        Authorization: `Bearer ${accessToken}`,
        "cache-control": "no-cache",
      };

      // LinkedIn v2 API with OpenID Connect
      // Get user profile info
      const profileResponse = await axios.get(
        `${LINKEDIN_API_URL}/userinfo`,
        { headers }
      );

      const profile = profileResponse.data;

      // return a small normalized object for controller consumption
      return {
        linkedinId: profile.sub || profile.id, // sub is the user ID in OpenID Connect
        firstName: profile.given_name || profile.firstName || "",
        lastName: profile.family_name || profile.lastName || "",
        email: profile.email || "",
      };
    } catch (error) {
      console.error(
        "Error getting LinkedIn profile:",
        error.response?.data || error.message
      );
      
      // Fallback to old API if new one fails
      try {
        const headers = {
          Authorization: `Bearer ${accessToken}`,
          "cache-control": "no-cache",
          "X-Restli-Protocol-Version": "2.0.0",
        };

        const profileResponse = await axios.get(`${LINKEDIN_API_URL}/me`, {
          headers,
        });
        const emailResponse = await axios.get(
          `${LINKEDIN_API_URL}/emailAddress?q=members&projection=(elements*(handle~))`,
          { headers }
        );

        const profile = profileResponse.data;
        const email = emailResponse.data.elements[0]?.["handle~"]?.emailAddress || "";

        return {
          linkedinId: profile.id,
          firstName: profile.localizedFirstName || "",
          lastName: profile.localizedLastName || "",
          email,
        };
      } catch (fallbackError) {
        console.error("Fallback API also failed:", fallbackError);
        throw new Error("Failed to get LinkedIn profile");
      }
    }
  }
}

export default new LinkedInService();
