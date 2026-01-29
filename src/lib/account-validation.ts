// Account Validation Client
// Calls the poller-service API with fallback to mock validation

import { mockValidateAccount, type MockBillingAccount } from './mock-data';

const POLLER_SERVICE_URL = import.meta.env.VITE_POLLER_SERVICE_URL;

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
  warning?: string;
  source: 'api' | 'mock';
}

/**
 * Convert mock billing account to standard format
 */
function convertMockToValidatedAccount(mock: MockBillingAccount): ValidatedAccount {
  return {
    accountNumber: mock.accountNumber,
    customerName: mock.customerName,
    customerType: 'residential',
    accountStatus: 'active',
    serviceAddress: mock.serviceAddress,
    services: {
      video: true,
      hsd: true,
      phone: false,
    },
    nodeId: null,
    primaryPhone: null,
    primaryEmail: null,
  };
}

/**
 * Validate an account using the real API with fallback to mock
 */
export async function validateAccount(accountNumber: string): Promise<AccountValidationResult> {
  let apiError: { code: string; message: string } | null = null;
  
  // If poller service URL is configured, try the real API first
  if (POLLER_SERVICE_URL) {
    try {
      console.log(`[AccountValidation] Using real API at ${POLLER_SERVICE_URL}`);
      
      const response = await fetch(
        `${POLLER_SERVICE_URL}/api/accounts/${encodeURIComponent(accountNumber)}`,
        {
          method: 'GET',
          headers: {
            'Accept': 'application/json',
          },
        }
      );
      
      if (!response.ok) {
        // API responded with error status
        if (response.status === 404) {
          return {
            success: false,
            error: { code: 'ACCOUNT_NOT_FOUND', message: `Account ${accountNumber} not found` },
            source: 'api',
          };
        }
        // Other API errors
        return {
          success: false,
          error: { code: 'API_ERROR', message: `Validation service returned status ${response.status}` },
          source: 'api',
        };
      }
      
      const result = await response.json();
      
      return {
        ...result,
        source: 'api',
      };
    } catch (error) {
      // Network error - capture for later
      apiError = {
        code: 'API_UNREACHABLE',
        message: error instanceof Error ? error.message : 'Unable to reach validation service',
      };
      console.warn('[AccountValidation] API unreachable:', apiError.message);
    }
  }
  
  // Fallback to mock validation
  console.log('[AccountValidation] Using mock validation');
  
  const mockResult = await mockValidateAccount(accountNumber);
  
  if (mockResult) {
    return {
      success: true,
      account: convertMockToValidatedAccount(mockResult),
      source: 'mock',
      warning: apiError ? 'Validation service unavailable. Using test data.' : undefined,
    };
  }
  
  // Mock didn't match - provide helpful message
  return {
    success: false,
    error: {
      code: apiError ? 'API_UNREACHABLE' : 'ACCOUNT_NOT_FOUND',
      message: apiError 
        ? `Unable to reach validation service. For testing, use account 123456789.`
        : `Account ${accountNumber} not found`,
    },
    source: 'mock',
  };
}

/**
 * Check if real API is available
 */
export function isRealApiConfigured(): boolean {
  return Boolean(POLLER_SERVICE_URL);
}
