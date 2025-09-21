import { ipcMain } from 'electron';
import fetch from 'node-fetch';

interface LoginRequest {
  email: string;
  password: string;
}

interface VerificationRequest {
  email: string;
  verificationCode: string;
}

interface ApiResponse {
  status: string;
  message: string;
  token?: string;
}

export class ApiService {
  private baseUrl = 'https://sih-bu.vercel.app/api';

  constructor() {
    console.log('ApiService constructor called');
    this.setupIpcHandlers();
    console.log('ApiService IPC handlers setup complete');
  }

  private setupIpcHandlers(): void {
    console.log('Setting up API IPC handlers...');
    
    // Login handler
    ipcMain.handle('api:login', async (event, request: LoginRequest) => {
      console.log('api:login handler called with:', request);
      try {
        const response = await fetch(`${this.baseUrl}/login`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            // If response is not JSON, use the default error message
          }
          throw new Error(errorMessage);
        }

        const data: ApiResponse = await response.json() as ApiResponse;
        
        if (data.status === 'success' && data.token) {
          return {
            success: true,
            data: {
              status: data.status,
              message: data.message,
              token: data.token,
            },
          };
        } else {
          throw new Error(data.message || 'Login failed');
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    // Verification handler
    ipcMain.handle('api:verify-digilocker', async (event, request: VerificationRequest) => {
      console.log('api:verify-digilocker handler called with:', request);
      try {
        const response = await fetch(`${this.baseUrl}/verify-digilocker`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            // If response is not JSON, use the default error message
          }
          throw new Error(errorMessage);
        }

        const data: ApiResponse = await response.json() as ApiResponse;
        
        if (data.status === 'success') {
          return {
            success: true,
            data: {
              status: data.status,
              message: data.message,
            },
          };
        } else {
          throw new Error(data.message || 'Verification failed');
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    // Resend verification handler
    ipcMain.handle('api:resend-verification', async (event, request: { email: string }) => {
      console.log('api:resend-verification handler called with:', request);
      try {
        const response = await fetch(`${this.baseUrl}/resend-verification`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(request),
        });

        if (!response.ok) {
          const errorText = await response.text();
          let errorMessage = `HTTP error! status: ${response.status}`;
          try {
            const errorData = JSON.parse(errorText);
            errorMessage = errorData.message || errorMessage;
          } catch {
            // If response is not JSON, use the default error message
          }
          throw new Error(errorMessage);
        }

        const data: ApiResponse = await response.json() as ApiResponse;
        
        if (data.status === 'success') {
          return {
            success: true,
            data: {
              status: data.status,
              message: data.message,
            },
          };
        } else {
          throw new Error(data.message || 'Failed to resend verification code');
        }
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error occurred',
        };
      }
    });

    console.log('All API IPC handlers registered successfully');
  }
}

// Export the service instance
export const apiService = new ApiService();
