import type { arrayOfMotorInputType } from "../types/app-types.js";
import type { MotorsTable } from "../database/schemas/motors.js";
import type { WhereQueryDataWithOr } from "../types/db-types.js";



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

export function motorFilters(query: any) {

  const whereQueryData: WhereQueryDataWithOr<MotorsTable> = {
    columns: ["status"],
    relations: ["!="],
    values: ["ARCHIVED"],
    or: []
  };

  if (query.search_string?.trim()) {
    const search = query.search_string.trim();
    whereQueryData.or!.push({
      columns: ["name"],
      relations: ["contains"],
      values: [search],
    });
  }

  if (query.status) {
    whereQueryData.columns.push("status");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.status);
  }

  if (query.created_by) {
    whereQueryData.columns.push("created_by");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.created_by);
  }

  if (query.field_id) {
    whereQueryData.columns.push("id");
    whereQueryData.relations.push("=");
    whereQueryData.values.push(query.field_id);
  }


  return whereQueryData;
}
