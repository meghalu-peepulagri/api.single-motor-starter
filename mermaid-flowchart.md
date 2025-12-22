```mermaid

---
config:
  layout: elk
---
graph TB

    %% TITLE
    Title[iDhara]

    %% CORE ENTITIES
    Admin[Admin]
    User[User]
    Locations[Locations]
    Devices[Devices]
    Mobile[Mobile App]
    Analytics[Analytics / Graphs]

    %% MANAGEMENT
    Device_Management["Device Management<br/>(Rename, Relocate, Delete)"]
    Location_Management["Location Management<br/>(Add, Rename, Delete)"]

    %% AUTHENTICATION
    Email_Login["Login<br/>(Email & Password)"]
    Mobile_Login["Login<br/>(Mobile No & OTP)"]

    %% DEVICE CREATION (ADMIN)
    Device_Fields["Required Device Fields<br/>
    • Device Name<br/>
    • MAC Address<br/>
    • PCB Number<br/>
    • Serial Number"]

    %% DEVICE ASSIGNING (USER)
    Assign_Request["Assigning Device In Mobile<br/>
    (User ID + PCB / Serial Number)"]

    %% VALIDATIONS DEVICE ADDING
    Validation["Validation Checks<br/>
    • Device Exists?<br/>
    • User Exists?<br/>
    • Already Assigned?<br/>
    • Deployment Status = Deployed?"]

    %% ERROR ASSIGNING DEVICE
    Error_Device_Not_Found["❌ Device Not Found"]
    Error_Already_Assigned["❌ Device Already Assigned"]
    Error_Not_Deployed["❌ Device Not Yet Deployed"]

    %% AUTHENTICATIONS
    Email_Login -- Authenticates --> Admin
    Mobile_Login -- Authenticates --> User

    %% ADMIN FLOW
    Admin -- Creates --> User
    Admin -- Adds Device --> Device_Fields
    Device_Fields --> Devices

    %% USER DEVICE ASSIGNING FLOW
    Assign_Request --> Validation

    Validation -- Device Not Found --> Error_Device_Not_Found
    Validation -- Already Assigned --> Error_Already_Assigned
    Validation -- Not Deployed --> Error_Not_Deployed

    Validation -- Valid --> Devices
    Devices -- Assigning --> User
    User -- Mapped To --> Locations

    %% DATA, ANALYTICS & MANAGEMENT
    Devices -- Sends Analytics Data --> Analytics
    Devices -- Managed Via --> Device_Management
    Locations -- Managed Via --> Location_Management

    %% DEVICE COMMUNICATION (MQTT)
    Mobile -- Publishes Control Topics --> Devices
    Devices -- ACK / Status Topics --> Mobile
    Devices -- Streams Live Data --> Mobile