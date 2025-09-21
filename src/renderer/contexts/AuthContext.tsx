import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService, AuthError } from '../services/authService';

interface AuthContextType {
  isAuthenticated: boolean;
  needsVerification: boolean;
  userEmail: string | null;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  verifyCode: (verificationCode: string) => Promise<void>;
  resendCode: () => Promise<void>;
  logout: () => void;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [needsVerification, setNeedsVerification] = useState(false);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check authentication status on mount
  useEffect(() => {
    const checkAuthStatus = () => {
      // Clear any existing auth data to start fresh
      authService.logout();
      
      setIsAuthenticated(false);
      setUserEmail(null);
      setNeedsVerification(false);
    };

    checkAuthStatus();
  }, []);

  const clearError = () => {
    setError(null);
  };

  const login = async (email: string, password: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await authService.login(email, password);
      setIsAuthenticated(true);
      setNeedsVerification(true); // Always require verification after login
      setUserEmail(email);
    } catch (err) {
      const errorMessage = (err as any)?.message || 'Login failed. Please try again.';
      setError(errorMessage);
      setIsAuthenticated(false);
      setNeedsVerification(false);
      setUserEmail(null);
    } finally {
      setIsLoading(false);
    }
  };

  const verifyCode = async (verificationCode: string): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await authService.verifyDigiLocker(verificationCode);
      setNeedsVerification(false);
      // Keep authenticated state and user email
    } catch (err) {
      const errorMessage = (err as any)?.message || 'Verification failed. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const resendCode = async (): Promise<void> => {
    setIsLoading(true);
    setError(null);

    try {
      await authService.resendVerificationCode();
      // Optionally show a success message
    } catch (err) {
      const errorMessage = (err as any)?.message || 'Failed to resend code. Please try again.';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const logout = (): void => {
    authService.logout();
    setIsAuthenticated(false);
    setNeedsVerification(false);
    setUserEmail(null);
    setError(null);
  };

  const contextValue: AuthContextType = {
    isAuthenticated,
    needsVerification,
    userEmail,
    isLoading,
    error,
    login,
    verifyCode,
    resendCode,
    logout,
    clearError,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
