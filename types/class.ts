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
  schedule_day: string | string[]; // Can be single day or array of days
  schedule_time: string;
  school_year: string;
  section_block: string;
  semester: string;
  students: Student[];
  createdBy: string;
  created_at: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateClassData {
  class_name: string;
  course_subject: string;
  room: string;
  schedule_day: string | string[]; // Can be single day or array of days
  schedule_time: string;
  school_year: string;
  section_block: string;
  semester: string;
  students?: Student[];
}
