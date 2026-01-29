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
      
      const result = await response.json();
      
      return {
        ...result,
        source: 'api',
      };
    } catch (error) {
      console.warn('[AccountValidation] Real API failed, falling back to mock:', error);
      // Fall through to mock validation
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
    };
  }
  
  return {
    success: false,
    error: {
      code: 'ACCOUNT_NOT_FOUND',
      message: `Account ${accountNumber} not found`,
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
