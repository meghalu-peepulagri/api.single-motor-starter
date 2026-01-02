import { pgTable, serial, integer, real, varchar, json, timestamp, index } from "drizzle-orm/pg-core";
import { relations, sql } from "drizzle-orm";
import { starterBoxes } from "./starter-boxes.js";

export const starterDefaultSettings = pgTable("starter_default_settings", {
  id: serial("id").primaryKey(),
  starter_id: integer("starter_id").notNull(),
  pcb_number: varchar("pcb_number"),

  faults_enabled: integer("faults_enabled").default(0),
  full_load_current: real("full_load_current"),
  seed_time: integer("seed_time"),

  /* ================= Device Configuration ================= 
     faults
  */

  fault_input_phase_failure: real("fault_input_phase_failure"),
  fault_low_voltage: real("fault_low_voltage"),
  fault_high_voltage: real("fault_high_voltage"),
  fault_voltage_imbalance: real("fault_voltage_imbalance"),
  fault_phase_angle_min: real("fault_phase_angle_min"),
  fault_phase_angle_max: real("fault_phase_angle_max"),

  alert_phase_failure: real("alert_phase_failure"),
  alert_low_voltage: real("alert_low_voltage"),
  alert_high_voltage: real("alert_high_voltage"),
  alert_voltage_imbalance: real("alert_voltage_imbalance"),
  alert_phase_angle_min: real("alert_phase_angle_min"),
  alert_phase_angle_max: real("alert_phase_angle_max"),

  recovery_low_voltage: real("recovery_low_voltage"),
  recovery_high_voltage: real("recovery_high_voltage"),

  /* ================= Motor Configuration ================= */

  motor_dry_run_fault: real("motor_dry_run_fault"),
  motor_overload_fault: real("motor_overload_fault"),
  motor_locked_rotor_fault: real("motor_locked_rotor_fault"),
  motor_output_phase_failure_fault: real("motor_output_phase_failure_fault"),
  motor_current_imbalance_fault: real("motor_current_imbalance_fault"),

  motor_dry_run_alert: real("motor_dry_run_alert"),
  motor_overload_alert: real("motor_overload_alert"),
  motor_locked_rotor_alert: real("motor_locked_rotor_alert"),
  motor_current_imbalance_alert: real("motor_current_imbalance_alert"),

  motor_overload_recovery: real("motor_overload_recovery"),
  motor_locked_rotor_recovery: real("motor_locked_rotor_recovery"),
  motor_current_imbalance_recovery: real("motor_current_imbalance_recovery"),

  /* ================= Atmel Calibration ================= */

  serial_number: varchar("serial_number", { length: 50 }),

  voltage_gain_r: integer("voltage_gain_r"),
  voltage_gain_y: integer("voltage_gain_y"),
  voltage_gain_b: integer("voltage_gain_b"),

  current_gain_r: integer("current_gain_r"),
  current_gain_y: integer("current_gain_y"),
  current_gain_b: integer("current_gain_b"),

  /* ================= MQTT & Server ================= */

  ca_certificate_filename: varchar("ca_certificate_filename", { length: 100 }),
  broker_address: varchar("broker_address", { length: 255 }),
  client_id: varchar("client_id", { length: 100 }),
  emqx_username: varchar("emqx_username", { length: 100 }),
  emqx_password: varchar("emqx_password", { length: 100 }),
  production_http_url: varchar("production_http_url", { length: 255 }),
  backup_http_url: varchar("backup_http_url", { length: 255 }),
  broker_port: integer("broker_port"),
  ca_certificate_length: integer("ca_certificate_length"),

  /* ================= IVRS ================= */

  sms_password: varchar("sms_password", { length: 10 }),
  current_language: integer("current_language"),
  authorized_numbers: json("authorized_numbers").$type<string[]>(),

  /* ================= Frequency ================= */

  default_live_frequency: integer("default_live_frequency"),
  high_priority_frequency: integer("high_priority_frequency"),
  medium_priority_frequency: integer("medium_priority_frequency"),
  low_priority_frequency: integer("low_priority_frequency"),
  power_info_frequency: integer("power_info_frequency"),

  /* ================= Feature Enable ================= */

  ivrs_enabled: integer("ivrs_enabled").default(0),
  sms_enabled: integer("sms_enabled").default(1),
  remote_enabled: integer("remote_enabled").default(0),

  /* ================= Individual Fault Enable ================= */

  input_phase_failure_enabled: integer("input_phase_failure_enabled").default(1),
  low_voltage_enabled: integer("low_voltage_enabled").default(1),
  high_voltage_enabled: integer("high_voltage_enabled").default(1),
  voltage_imbalance_enabled: integer("voltage_imbalance_enabled").default(1),
  dry_run_enabled: integer("dry_run_enabled").default(1),
  overload_enabled: integer("overload_enabled").default(1),
  locked_rotor_enabled: integer("locked_rotor_enabled").default(1),
  output_phase_failure_enabled: integer("output_phase_failure_enabled").default(1),
  current_imbalance_enabled: integer("current_imbalance_enabled").default(1),

  created_at: timestamp("created_at").defaultNow(),
  updated_at: timestamp("updated_at").defaultNow().default(sql`CURRENT_TIMESTAMP`),
},
  table => [
    index("starter_default_settings_starter_id_idx").on(table.starter_id),
  ]);

export type StarterDefaultSettings = typeof starterDefaultSettings.$inferSelect;
export type NewStarterDefaultSettings = typeof starterDefaultSettings.$inferInsert;
export type StarterDefaultSettingsTable = typeof starterDefaultSettings;

export const starterDefaultSettingsRelations = relations(starterDefaultSettings, ({ one }) => ({
  starter: one(starterBoxes, {
    fields: [starterDefaultSettings.starter_id],
    references: [starterBoxes.id],
  }),
}));
