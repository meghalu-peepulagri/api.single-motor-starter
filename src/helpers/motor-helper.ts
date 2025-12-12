import type { MotorsTable } from "../database/schemas/motors.js";
import { starterBoxParameters } from "../database/schemas/starter-parameters.js";
import type { arrayOfMotorInputType } from "../types/app-types.js";
import type { WhereQueryData } from "../types/db-types.js";



export function checkDuplicateMotorTitles(motors: arrayOfMotorInputType[] | undefined) {
  if (!Array.isArray(motors)) return [];
  const titles = motors.map(m => (m?.name ?? "").toString().toLowerCase());
  const duplicateIndexes: number[] = [];

  for (let i = 0; i < titles.length; i++) {
    if (titles.indexOf(titles[i]) !== i) {
      duplicateIndexes.push(i);
    }
  }
  return duplicateIndexes;
}

export function motorFilters(query: any, user: any) {

  const whereQueryData: WhereQueryData<MotorsTable> = {
    columns: ["status"],
    relations: ["!="],
    values: ["ARCHIVED"],
  };

  if (query.search_string?.trim()) {
    const search = query.search_string.trim();
    whereQueryData.columns.push("name");
    whereQueryData.relations.push("contains");
    whereQueryData.values.push(search);
  }

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }

  if (user.id && user.user_type !== "ADMIN") {
    whereQueryData.columns.push("created_by");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(user.id);
  }

  if (query.location_id) {
    whereQueryData.columns.push("location_id");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.location_id);
  }


  return whereQueryData;
}


export function buildAnalyticsFilter(parameter: string) {
  const selectedFieldsMain: any = {
    time_stamp: starterBoxParameters.time_stamp,
    id: starterBoxParameters.id,
  };

  // const selectedFieldsTest: any = {
  //   motor_ref_id: testStarterParameters.motor_ref_id,
  //   time_stamp: testStarterParameters.time_stamp,
  //   id: testStarterParameters.id,
  // };

  if (parameter === "voltage") {
    selectedFieldsMain.line_voltage_r = starterBoxParameters.line_voltage_r ?? 0;
    selectedFieldsMain.line_voltage_y = starterBoxParameters.line_voltage_y ?? 0;
    selectedFieldsMain.line_voltage_b = starterBoxParameters.line_voltage_b ?? 0;
    selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    // selectedFieldsTest.line_voltage_vry = testStarterParameters.line_voltage_vry ?? 0;
    // selectedFieldsTest.line_voltage_vyb = testStarterParameters.line_voltage_vyb ?? 0;
    // selectedFieldsTest.line_voltage_vbr = testStarterParameters.line_voltage_vbr ?? 0;
  }
  else if (parameter === "current") {
    selectedFieldsMain.current_r = starterBoxParameters.current_r ?? 0;
    selectedFieldsMain.current_y = starterBoxParameters.current_y ?? 0;
    selectedFieldsMain.current_b = starterBoxParameters.current_b ?? 0;
    selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;
    // selectedFieldsTest.current_i1 = testStarterParameters.current_i1 ?? 0;
    // selectedFieldsTest.current_i2 = testStarterParameters.current_i2 ?? 0;
    // selectedFieldsTest.current_i3 = testStarterParameters.current_i3 ?? 0;
  }
  else {
    selectedFieldsMain.line_voltage_r = starterBoxParameters.line_voltage_r ?? 0;
    selectedFieldsMain.line_voltage_b = starterBoxParameters.line_voltage_b ?? 0;
    selectedFieldsMain.line_voltage_y = starterBoxParameters.line_voltage_y ?? 0;
    selectedFieldsMain.avg_voltage = starterBoxParameters.avg_voltage ?? 0;
    selectedFieldsMain.current_r = starterBoxParameters.current_r ?? 0;
    selectedFieldsMain.current_y = starterBoxParameters.current_y ?? 0;
    selectedFieldsMain.current_y = starterBoxParameters.current_y ?? 0;
    selectedFieldsMain.avg_current = starterBoxParameters.avg_current ?? 0;

    // selectedFieldsTest.line_voltage_vry = testStarterParameters.line_voltage_vry ?? 0;
    // selectedFieldsTest.line_voltage_vyb = testStarterParameters.line_voltage_vyb ?? 0;
    // selectedFieldsTest.line_voltage_vbr = testStarterParameters.line_voltage_vbr ?? 0;
    // selectedFieldsTest.current_i1 = testStarterParameters.current_i1 ?? 0;
    // selectedFieldsTest.current_i2 = testStarterParameters.current_i2 ?? 0;
    // selectedFieldsTest.current_i3 = testStarterParameters.current_i3 ?? 0;
  }

  return { selectedFieldsMain };
}
