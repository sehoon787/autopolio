import { EducationCreate } from '@/api/credentials'

// Academic degree options (formal education)
export const ACADEMIC_DEGREE_OPTIONS = [
  { value: 'high_school', label: 'credentials:academicEducation.degrees.highSchool' },
  { value: 'associate', label: 'credentials:academicEducation.degrees.associate' },
  { value: 'bachelor', label: 'credentials:academicEducation.degrees.bachelor' },
  { value: 'master', label: 'credentials:academicEducation.degrees.master' },
  { value: 'doctorate', label: 'credentials:academicEducation.degrees.doctorate' },
]

// Graduation status options
export const GRADUATION_STATUS_OPTIONS = [
  { value: 'graduated', label: 'credentials:academicEducation.graduationStatus.graduated' },
  { value: 'enrolled', label: 'credentials:academicEducation.graduationStatus.enrolled' },
  { value: 'completed', label: 'credentials:academicEducation.graduationStatus.completed' },
  { value: 'withdrawn', label: 'credentials:academicEducation.graduationStatus.withdrawn' },
]

// Degree types that should show university autocomplete
export const UNIVERSITY_DEGREE_TYPES = ['associate', 'bachelor', 'master', 'doctorate']

export interface FormData extends EducationCreate {
  school_name: string
  major: string
  degree: string
  start_date: string
  end_date: string
  graduation_status: string
  gpa: string
  description: string
  school_country?: string
  school_country_code?: string
  school_state?: string
  school_domain?: string
  school_web_page?: string
}

export const INITIAL_FORM_DATA: FormData = {
  school_name: '',
  major: '',
  degree: '',
  start_date: '',
  end_date: '',
  graduation_status: '',
  gpa: '',
  description: '',
  school_country: '',
  school_country_code: '',
  school_state: '',
  school_domain: '',
  school_web_page: '',
}
