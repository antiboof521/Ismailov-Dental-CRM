import { relations } from "drizzle-orm";
import { integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";

// Define the 'users' table using Firebase Auth UID as unique identifier
export const users = pgTable("users", {
  id: serial("id").primaryKey(),
  uid: text("uid").notNull().unique(), // Firebase Auth UID
  email: text("email").notNull(),
  fullName: text("full_name"),
  role: text("role").default("doctor").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define 'patients' table
export const patients = pgTable("patients", {
  id: serial("id").primaryKey(),
  fullName: text("full_name").notNull(),
  phone: text("phone"),
  birthDate: text("birth_date"),
  gender: text("gender").default("male"),
  notes: text("notes"),
  allergies: text("allergies"),
  createdAt: timestamp("created_at").defaultNow(),
});

// Define 'appointments' table
export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  patientId: integer("patient_id").references(() => patients.id),
  doctorName: text("doctor_name"),
  date: text("date").notNull(),
  time: text("time").notNull(),
  status: text("status").default("pending").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
});

export const usersRelations = relations(users, ({ many }) => ({}));
