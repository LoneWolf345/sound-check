// Account Validation Client
// Calls the Billing API with fallback to mock validation

import { mockValidateAccount, type MockBillingAccount } from './mock-data';
import { getServiceBaseUrl, isServiceConfigured } from './api-services';

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

// Helper to detect test account number format
function isTestAccountNumber(accountNumber: string): boolean {
  return /^[123]\d{8}$/.test(accountNumber);
}

// Helper to detect real account number format
function isRealAccountNumber(accountNumber: string): boolean {
  return /^8160\d{12}$/.test(accountNumber);
}

/**
 * Validate an account using the real API with fallback to mock
 */
export async function validateAccount(accountNumber: string): Promise<AccountValidationResult> {
  let apiError: { code: string; message: string } | null = null;
  const baseUrl = getServiceBaseUrl('billing');

  // If billing service is configured, try the real API first
  if (baseUrl) {
    try {
      console.log(`[AccountValidation] Using API at ${baseUrl}/accounts/...`);

      const response = await fetch(
        `${baseUrl}/accounts/${encodeURIComponent(accountNumber)}`,
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

  // --- API not configured or unreachable: determine behavior based on account type ---

  // Real account (8160...) but no API configured/reachable
  if (isRealAccountNumber(accountNumber)) {
    const errorMessage = isServiceConfigured('billing')
      ? 'Unable to reach validation service. Please try again later or use test account 123456789.'
      : 'Real account validation is not available in this environment. Please use test account 123456789.';

    return {
      success: false,
      error: {
        code: isServiceConfigured('billing') ? 'API_UNREACHABLE' : 'API_NOT_CONFIGURED',
        message: errorMessage,
      },
      source: 'mock',
    };
  }

  // Test account: use mock validation
  if (isTestAccountNumber(accountNumber)) {
    console.log('[AccountValidation] Using mock validation for test account');

    const mockResult = await mockValidateAccount(accountNumber);

    if (mockResult) {
      return {
        success: true,
        account: convertMockToValidatedAccount(mockResult),
        source: 'mock',
        warning: apiError ? 'Validation service unavailable. Using test data.' : undefined,
      };
    }
  }

  // Fallback: account format not recognized (shouldn't hit this if form validation works)
  return {
    success: false,
    error: {
      code: 'INVALID_ACCOUNT_FORMAT',
      message: 'Account must be 16 digits starting with 8160, or use test account 123456789.',
    },
    source: 'mock',
  };
}

/**
 * Check if real API is available
 */
export function isRealApiConfigured(): boolean {
  return isServiceConfigured('billing');
}
