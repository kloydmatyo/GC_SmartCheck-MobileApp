export interface Student {
  student_id: string;
  first_name: string;
  last_name: string;
  email?: string;
}

export interface Class {
  id: string;
  class_name: string;
  course_subject: string;
  room: string;
  section_block: string;
  students: Student[];
  createdBy: string;
  instructorId?: string;
  created_at: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived?: boolean;
}

export interface CreateClassData {
  class_name: string;
  course_subject: string;
  room: string;
  section_block: string;
  students?: Student[];
  instructorId?: string;
  isArchived?: boolean;
}
