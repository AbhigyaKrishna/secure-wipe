// Authentication service for SecureWipe Electron app

export interface LoginResponse {
  status: string;
  message: string;
  token: string;
}

export interface VerificationResponse {
  status: string;
  message: string;
}

export class AuthError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'AuthError';
    this.code = code;
  }
}

class AuthService {
  private baseUrl = 'https://sih-bu.vercel.app/api';
  private token: string | null = null;
  private userEmail: string | null = null;

  constructor() {
    // Load stored auth data from localStorage
    this.loadStoredAuth();
  }

  private loadStoredAuth(): void {
    try {
      this.token = localStorage.getItem('secureWipe_token');
      this.userEmail = localStorage.getItem('secureWipe_email');
    } catch (error) {
      console.warn('Failed to load stored auth data:', error);
    }
  }

  private saveAuth(token: string, email: string): void {
    try {
      localStorage.setItem('secureWipe_token', token);
      localStorage.setItem('secureWipe_email', email);
      this.token = token;
      this.userEmail = email;
    } catch (error) {
      console.warn('Failed to save auth data:', error);
    }
  }

  private clearAuth(): void {
    try {
      localStorage.removeItem('secureWipe_token');
      localStorage.removeItem('secureWipe_email');
      localStorage.removeItem('secureWipe_verification_completed');
      this.token = null;
      this.userEmail = null;
    } catch (error) {
      console.warn('Failed to clear auth data:', error);
    }
  }

  async login(email: string, password: string): Promise<LoginResponse> {
    try {
      // Use Electron's main process to make the API call (bypasses CORS)
      const result = await window.electron.api.login({ email, password });
      
      if (result.success && result.data) {
        this.saveAuth(result.data.token, email);
        return result.data;
      } else {
        throw new Error(result.error || 'Login failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new AuthError(error.message);
      }
      throw new AuthError('Network error occurred during login');
    }
  }

  async verifyDigiLocker(verificationCode: string): Promise<VerificationResponse> {
    if (!this.userEmail) {
      throw new AuthError('No user email found. Please login again.');
    }

    try {
      // Use Electron's main process to make the API call (bypasses CORS)
      const result = await window.electron.api.verifyDigiLocker({
        email: this.userEmail,
        verificationCode,
      });
      
      if (result.success && result.data) {
        return result.data;
      } else {
        throw new Error(result.error || 'Verification failed');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new AuthError(error.message);
      }
      throw new AuthError('Network error occurred during verification');
    }
  }

  async resendVerificationCode(): Promise<void> {
    if (!this.userEmail) {
      throw new AuthError('No user email found. Please login again.');
    }

    try {
      // Use Electron's main process to make the API call (bypasses CORS)
      const result = await window.electron.api.resendVerification({
        email: this.userEmail,
      });
      
      if (!result.success) {
        throw new Error(result.error || 'Failed to resend verification code');
      }
    } catch (error) {
      if (error instanceof Error) {
        throw new AuthError(error.message);
      }
      throw new AuthError('Network error occurred while resending verification code');
    }
  }

  logout(): void {
    this.clearAuth();
  }

  isAuthenticated(): boolean {
    return !!(this.token && this.userEmail);
  }

  getToken(): string | null {
    return this.token;
  }

  getUserEmail(): string | null {
    return this.userEmail;
  }

  // Method to check if user needs verification
  needsVerification(): boolean {
    // Only need verification if we have a token but haven't completed verification yet
    // We'll store verification status in localStorage
    if (!this.isAuthenticated()) return false;
    
    try {
      const verificationCompleted = localStorage.getItem('secureWipe_verification_completed');
      return verificationCompleted !== 'true';
    } catch (error) {
      console.warn('Failed to check verification status:', error);
      return true; // Default to needing verification if we can't check
    }
  }

  // Mark verification as completed
  markVerificationCompleted(): void {
    try {
      localStorage.setItem('secureWipe_verification_completed', 'true');
    } catch (error) {
      console.warn('Failed to save verification status:', error);
    }
  }
}

export const authService = new AuthService();
export { AuthError };
