// Mock teachers service
export interface Teacher {
  id: string
  tid: string
  name: string
  email: string
  phone: string
  subject?: string
}

export const teachersService = {
  getAll: async (): Promise<Teacher[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    return Array.from({ length: 50 }, (_, i) => ({
      id: `t${i + 1}`,
      tid: `T${String(i + 1).padStart(3, '0')}`,
      name: `Teacher ${i + 1}`,
      email: `teacher${i + 1}@school.com`,
      phone: `077${String(Math.floor(Math.random() * 10000000)).padStart(7, '0')}`,
      subject: ['Mathematics', 'English', 'Science', 'Sinhala'][i % 4],
    }))
  },

  getById: async (id: string): Promise<Teacher | null> => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const teachers = await teachersService.getAll()
    return teachers.find((t) => t.id === id) || null
  },
}

