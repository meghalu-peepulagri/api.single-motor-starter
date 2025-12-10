// import { ALREADY_SCHEDULED_EXISTS } from "../constants/app-constants.js";
// import ConflictException from "../exceptions/conflict-exception.js";

// export async function checkMotorScheduleConflict(validatedReqData: any, existingMotorSchedule: any) {
//   if (!existingMotorSchedule)
//     return;

//   const newStart = validatedReqData.output.start_time;
//   const newEnd = validatedReqData.output.end_time;
//   const existStart = existingMotorSchedule.start_time;
//   const existEnd = existingMotorSchedule.end_time;

//   // Exact match
//   if (newStart === existStart && newEnd === existEnd) {
//     throw new ConflictException(ALREADY_SCHEDULED_EXISTS);
//   }

//   //  Overlap check (if times intersect at all)
//   // The only case where there is NO conflict is when:
//   const isOverlapping = !(newEnd <= existStart || newStart >= existEnd);

//   if (isOverlapping) {
//     throw new ConflictException(
//       "Schedule overlaps with an existing schedule",
//     );
//   }
// }
