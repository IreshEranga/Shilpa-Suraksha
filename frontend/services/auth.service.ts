export interface User {
  id: string
  email: string
  name: string
  role: 'teacher' | 'admin'
}

export const authService = {
  login: async (email: string, password: string, role: 'teacher' | 'admin'): Promise<{ user: User; token: string }> => {
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000))
    
    return {
      user: {
        id: '1',
        email,
        name: role === 'admin' ? 'Admin User' : 'Teacher User',
        role,
      },
      token: 'mock-jwt-token',
    }
  },

  logout: () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
  },

  getCurrentUser: (): User | null => {
    const userStr = localStorage.getItem('user')
    return userStr ? JSON.parse(userStr) : null
  },
}

