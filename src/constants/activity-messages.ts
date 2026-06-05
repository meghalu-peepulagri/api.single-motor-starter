export function buildActivityMessage(
  action: string,
  oldData?: Record<string, unknown> | null,
  newData?: Record<string, unknown> | null,
  entityId?: number | null
): string {
  const name = (newData?.name ?? oldData?.name) as string | undefined;
  const count = newData?.count as number | undefined;

  switch (action) {
    // Auth
    case "REGISTERED": return "New user registered";
    case "LOGIN": return "User logged in";
    case "LOGGED_OUT": return "User logged out";

    // Device
    case "DEVICE_ADDED":
      return name ? `Device '${name}' added` : "Device added";
    case "DEVICE_DELETED":
      return name ? `Device '${name}' deleted` : "Device deleted";
    case "STARTER_REMOVED":
      return name ? `Starter '${name}' removed from account` : "Starter removed from account";
    case "DEVICE_RESET_TRIGGERED":
      return entityId ? `Device #${entityId} reset triggered` : "Device reset triggered";
    case "DEPLOY_STATUS_UPDATE": {
      const o = oldData?.status as string | undefined;
      const n = newData?.status as string | undefined;
      return o && n ? `Deploy status changed from '${o}' to '${n}'` : "Device deploy status updated";
    }
    case "LOCATION_ASSIGNED": {
      const locationId = newData?.location_id;
      return locationId ? `Device assigned to location #${locationId}` : "Device assigned to location";
    }
    case "STARTER_ASSIGNED": {
      const userId = newData?.user_id;
      return userId ? `Device assigned to user #${userId}` : "Device assigned to user";
    }
    case "LOCATION_REPLACED": {
      const o = oldData?.location_id;
      const n = newData?.location_id;
      return o && n ? `Device location changed from #${o} to #${n}` : "Device location replaced";
    }
    case "DEVICE_INSTALLED_LOCATION_UPDATED": {
      const o = oldData?.device_installed_location as string | undefined;
      const n = newData?.device_installed_location as string | undefined;
      return o && n ? `Installed location changed from '${o}' to '${n}'` : "Device installed location updated";
    }
    case "SETTINGS_SYNC_STATUS_OVERRIDE": {
      const o = oldData?.synced_settings_status as string | undefined;
      const n = newData?.synced_settings_status as string | undefined;
      return o && n ? `Settings sync status changed from '${o}' to '${n}'` : "Settings sync status overridden";
    }
    case "FAULT_MANUALLY_CLEARED": {
      const motorId = newData?.motor_id;
      return motorId ? `Fault manually cleared for motor #${motorId}` : "Fault manually cleared";
    }
    case "DEVICE_POWER_ON": return "Device powered ON";
    case "DEVICE_POWER_OFF": return "Device powered OFF";
    case "DEVICE_ALLOCATED":
    case "DEVICE_DEALLOCATED":
    case "DEVICE_REALLOCATED": {
      const alloc = newData?.device_allocation as string | undefined;
      return alloc ? `Device ${alloc.toLowerCase()}` : action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
    }

    // Motor
    case "MOTOR_ADDED":
      return name ? `Motor '${name}' added` : "Motor added";
    case "MOTOR_DELETED":
      return name ? `Motor '${name}' deleted` : "Motor deleted";

    // Settings
    case "DEFAULT_SETTINGS_UPDATED": return "Default settings updated";
    case "DEVICE_SETTINGS_LIMITS_UPDATED": return "Device settings limits updated";
    case "DEFAULT_SETTINGS_LIMITS_UPDATED": return "Default settings limits updated";
    case "SETTINGS_ACK_UPDATED": {
      const starterId = newData?.starter_id;
      return starterId ? `Settings acknowledged by device #${starterId}` : "Settings acknowledged by device";
    }

    // Field
    case "FIELD_CREATED":
      return name ? `Field '${name}' created` : "Field created";
    case "FIELD_UPDATED":
      return name ? `Field '${name}' updated` : "Field updated";

    // Dispatch
    case "DISPATCH_CREATED": {
      const simNo = newData?.sim_no;
      return simNo ? `Device dispatch created for SIM ${simNo}` : "Device dispatch created";
    }
    case "DISPATCH_UPDATED": {
      const simNo = newData?.sim_no;
      return simNo ? `Device dispatch updated — SIM ${simNo}` : "Device dispatch updated";
    }

    // Schedule
    case "SCHEDULE_CREATED": return "Schedule created";
    case "SCHEDULES_BULK_CREATED":
      return count ? `${count} schedules created` : "Multiple schedules created";
    case "SCHEDULE_UPDATED":
      return entityId ? `Schedule #${entityId} updated` : "Schedule updated";
    case "SCHEDULE_DELETED":
      return entityId ? `Schedule #${entityId} deleted` : "Schedule deleted";
    case "SCHEDULE_STOPPED":
      return entityId ? `Schedule #${entityId} stopped` : "Schedule stopped";
    case "SCHEDULE_RESTARTED":
      return entityId ? `Schedule #${entityId} restarted` : "Schedule restarted";
    case "ALL_SCHEDULES_STOPPED": return "All schedules stopped";
    case "SCHEDULE_REPEAT_DAYS_ADDED": {
      const days = newData?.days_of_week;
      return days ? `Schedule repeat days updated to ${days}` : "Schedule repeat days updated";
    }
    case "SCHEDULE_ACKNOWLEDGED":
      return entityId ? `Schedule #${entityId} acknowledged` : "Schedule acknowledged";
    case "SCHEDULES_BULK_ACKNOWLEDGED":
      return count ? `${count} schedules acknowledged` : "Schedules bulk acknowledged";
    case "SCHEDULES_BULK_STOPPED":
      return count ? `${count} schedules stopped` : "Schedules bulk stopped";
    case "SCHEDULES_BULK_RESTARTED":
      return count ? `${count} schedules restarted` : "Schedules bulk restarted";
    case "SCHEDULES_BULK_DELETED":
      return count ? `${count} schedules deleted` : "Schedules bulk deleted";

    // User
    case "USER_DELETED": return "User account deleted";

    default:
      return action.replace(/_/g, " ").toLowerCase().replace(/^\w/, c => c.toUpperCase());
  }
}
