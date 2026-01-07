export interface Student {
  id: string
  sid: string
  name: string
  grade: number
  class: string
  section: string
  riskLevel?: 'low' | 'medium' | 'high' | 'critical'
  address?: string
}

export const studentsService = {
  getAll: async (): Promise<Student[]> => {
    await new Promise((resolve) => setTimeout(resolve, 500))
    
    return Array.from({ length: 1500 }, (_, i) => ({
      id: `s${i + 1}`,
      sid: `S${String(i + 1).padStart(3, '0')}`,
      name: `Student ${i + 1}`,
      grade: Math.floor(Math.random() * 5) + 1,
      class: `Class ${String.fromCharCode(65 + (i % 3))}`,
      section: ['A', 'B', 'C'][i % 3],
      riskLevel: ['low', 'medium', 'high', 'critical'][Math.floor(Math.random() * 4)] as any,
      address: `${Math.floor(Math.random() * 100)} Street, City`,
    }))
  },

  getByClass: async (grade: number, className: string): Promise<Student[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const all = await studentsService.getAll()
    return all.filter((s) => s.grade === grade && s.class === className)
  },

  getWeakStudents: async (grade: number, className: string): Promise<Student[]> => {
    await new Promise((resolve) => setTimeout(resolve, 300))
    const classStudents = await studentsService.getByClass(grade, className)
    return classStudents.filter((s) => s.riskLevel === 'high' || s.riskLevel === 'critical')
  },
}

