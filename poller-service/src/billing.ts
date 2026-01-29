// Billing API Client for Sound Check
// Fetches account information from internal ACP Middleware Account Billing API

const BILLING_API_BASE_URL = process.env.BILLING_API_BASE_URL || 
  'https://acp-middleware-account-billing-system-prod.apps.prod-ocp4.corp.cableone.net';

const BILLING_API_TIMEOUT_MS = parseInt(process.env.BILLING_API_TIMEOUT_MS || '10000', 10);

export interface BillingApiAddress {
  attention_to?: string;
  city: string;
  country?: string;
  line1: string;
  line2?: string;
  postal_code?: string;
  state: string;
  validation_status?: string;
  zip?: string;
}

export interface BillingApiEmail {
  email_address: string;
  email_type?: string;
  is_primary: boolean;
  message?: string;
}

export interface BillingApiServices {
  video: boolean;
  hsd: boolean;
  phone: boolean;
}

export interface BillingApiResponse {
  first_name?: string;
  last_name?: string;
  customer_name?: string;
  business_name?: string;
  customer_type: string;
  customer_sub_type?: string;
  account_status: string;
  service_address?: BillingApiAddress;
  services?: BillingApiServices;
  node_id?: string;
  primary_phone_number?: string;
  email?: BillingApiEmail[];
}

export interface BillingApiError {
  code: string;
  description: string;
}

export interface ValidatedAccount {
  accountNumber: string;
  customerName: string;
  customerType: 'residential' | 'business';
  accountStatus: string;
  serviceAddress: string;
  services: {
    video: boolean;
    hsd: boolean;
    phone: boolean;
  };
  nodeId: string | null;
  primaryPhone: string | null;
  primaryEmail: string | null;
}

export interface AccountValidationResult {
  success: boolean;
  account?: ValidatedAccount;
  error?: {
    code: string;
    message: string;
  };
}

/**
 * Format an address object into a single line string
 */
function formatAddress(addr?: BillingApiAddress): string {
  if (!addr) return '';
  
  const parts = [
    addr.line1,
    addr.line2,
    addr.city,
    addr.state,
    addr.zip || addr.postal_code,
  ].filter(Boolean);
  
  return parts.join(', ');
}

/**
 * Get the customer name from various possible fields
 */
function getCustomerName(data: BillingApiResponse): string {
  // For business accounts, prefer business_name
  if (data.customer_type?.toLowerCase() === 'business' && data.business_name) {
    return data.business_name;
  }
  
  // For residential, combine first and last name
  if (data.first_name || data.last_name) {
    return [data.first_name, data.last_name].filter(Boolean).join(' ');
  }
  
  // Fallback to customer_name
  return data.customer_name || 'Unknown';
}

/**
 * Get the primary email from the email array
 */
function getPrimaryEmail(emails?: BillingApiEmail[]): string | null {
  if (!emails || emails.length === 0) return null;
  
  const primary = emails.find(e => e.is_primary);
  return primary?.email_address || emails[0]?.email_address || null;
}

/**
 * Validate an account number against the billing API
 */
export async function validateAccount(accountNumber: string): Promise<AccountValidationResult> {
  const url = `${BILLING_API_BASE_URL}/accounts/${encodeURIComponent(accountNumber)}`;
  
  console.log(`[Billing] Validating account ${accountNumber}...`);
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), BILLING_API_TIMEOUT_MS);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'application/json',
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (response.status === 404) {
      const errorData: BillingApiError = await response.json();
      console.log(`[Billing] Account ${accountNumber} not found`);
      return {
        success: false,
        error: {
          code: 'ACCOUNT_NOT_FOUND',
          message: errorData.description || `Account ${accountNumber} not found`,
        },
      };
    }
    
    if (!response.ok) {
      console.error(`[Billing] API returned ${response.status}`);
      return {
        success: false,
        error: {
          code: 'API_ERROR',
          message: `Billing API returned status ${response.status}`,
        },
      };
    }
    
    const data: BillingApiResponse = await response.json();
    
    console.log(`[Billing] Account ${accountNumber} validated successfully`);
    
    return {
      success: true,
      account: {
        accountNumber,
        customerName: getCustomerName(data),
        customerType: data.customer_type?.toLowerCase() === 'business' ? 'business' : 'residential',
        accountStatus: data.account_status || 'unknown',
        serviceAddress: formatAddress(data.service_address),
        services: {
          video: data.services?.video ?? false,
          hsd: data.services?.hsd ?? false,
          phone: data.services?.phone ?? false,
        },
        nodeId: data.node_id || null,
        primaryPhone: data.primary_phone_number || null,
        primaryEmail: getPrimaryEmail(data.email),
      },
    };
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      console.error(`[Billing] Request timed out for account ${accountNumber}`);
      return {
        success: false,
        error: {
          code: 'TIMEOUT',
          message: 'Billing API request timed out',
        },
      };
    }
    
    console.error(`[Billing] Error validating account ${accountNumber}:`, error);
    return {
      success: false,
      error: {
        code: 'API_ERROR',
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
    };
  }
}
