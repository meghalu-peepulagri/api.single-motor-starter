---
config:
  layout: elk
  look: handDrawn
  theme: neutral
---
graph TB

    %% =================== STYLING ===================
    classDef admin fill:#e1bee7,stroke:#4a148c,stroke-width:3px,rx:10,ry:10;
    classDef user fill:#bbdefb,stroke:#0d47a1,stroke-width:3px,rx:10,ry:10;
    classDef api fill:#fff9c4,stroke:#f57c00,stroke-width:2px,rx:5,ry:5;
    classDef db fill:#ffccbc,stroke:#bf360c,stroke-width:2px;
    classDef device fill:#c8e6c9,stroke:#1b5e20,stroke-width:2px,stroke-dasharray: 5 5;
    classDef action fill:#e0e0e0,stroke:#424242,stroke-width:1px,rx:3,ry:3;

    %% =================== ACTORS ===================
    Admin([👮‍♂️ Admin<br/>Web Dashboard]):::admin
    User([👨‍🌾 User<br/>Mobile App]):::user
    Hardware([⚙️ Smart Starter<br/>IoT Device]):::device

    %% =================== ADMIN PANEL SECTION ===================
    subgraph Admin_Panel ["�️ ADMIN WEB DASHBOARD"]
        direction TB
        
        Admin_Login[Login with Email]:::action
        Admin_Dashboard[Dashboard Home]:::action
        
        subgraph Admin_Features ["Admin Features"]
            direction LR
            Add_Device[➕ Add New Starter]:::action
            View_Starters[📋 Starter List<br/>All Devices]:::action
            Assign_User[👤 Assign to User]:::action
            Manage_Settings[⚙️ Manage Settings]:::action
        end
        
        Starter_List_View["📊 STARTER LIST VIEW<br/>────────────<br/>• Starter ID, PCB, Serial<br/>• Device Status<br/>• Assigned User<br/>• Connected Motors<br/>• Signal Quality<br/>• Latest Voltage/Current"]:::api
    end

    %% =================== USER MOBILE SECTION ===================
    subgraph User_Mobile ["📱 USER MOBILE APP"]
        direction TB
        
        User_Login[Login with OTP]:::action
        User_Home[My Motors]:::action
        
        subgraph User_Features ["User Features"]
            direction LR
            Assign_Device[➕ Add Motor<br/>Enter PCB + Serial]:::action
            View_Motors[📋 Motor List<br/>My Devices]:::action
            Control_Motor[🎮 ON/OFF Control]:::action
            Schedule[📅 Set Schedule]:::action
        end
        
        Motor_List_View["📊 MOTOR LIST VIEW<br/>────────────<br/>• Motor Name, HP<br/>• State (ON/OFF)<br/>• Mode (Manual/Auto)<br/>• Location<br/>• Starter Details<br/>• Live Voltage/Current"]:::api
    end

    %% =================== BACKEND API ===================
    subgraph Backend ["🔧 BACKEND API (Hono + PostgreSQL)"]
        direction TB
        
        Auth_API[🔐 Auth API<br/>Login/Register]:::api
        Starter_API[📦 Starter API<br/>CRUD Operations]:::api
        Motor_API[🚜 Motor API<br/>Control & Monitor]:::api
        MQTT_Service[📡 MQTT Service<br/>Device Communication]:::api
        
        subgraph Database ["💾 DATABASE"]
            direction LR
            Users_DB[(👥 Users)]:::db
            Starters_DB[(📦 Starters)]:::db
            Motors_DB[(🚜 Motors)]:::db
            Runtime_DB[(📊 Analytics)]:::db
        end
    end

    %% =================== CONNECTIONS ===================
    
    %% ADMIN FLOWS
    Admin --> Admin_Login --> Admin_Dashboard
    Admin_Dashboard --> Admin_Features
    
    Add_Device --> Starter_API
    View_Starters --> Starter_API --> Starter_List_View
    Assign_User --> Starter_API
    Manage_Settings --> Starter_API
    
    %% USER FLOWS
    User --> User_Login --> User_Home
    User_Home --> User_Features
    
    Assign_Device --> Motor_API
    View_Motors --> Motor_API --> Motor_List_View
    Control_Motor --> Motor_API --> MQTT_Service
    Schedule --> Motor_API
    
    %% API TO DATABASE
    Auth_API --> Users_DB
    Starter_API --> Starters_DB & Motors_DB
    Motor_API --> Motors_DB & Runtime_DB
    
    %% MQTT TO HARDWARE
    MQTT_Service <== "Commands/ACK" ==> Hardware
    Hardware -- "Telemetry Data" --> MQTT_Service
    MQTT_Service --> Runtime_DB
    
    %% KEY DIFFERENCE ANNOTATIONS
    Starter_List_View -. "Admin sees<br/>ALL devices" .- Starters_DB
    Motor_List_View -. "User sees<br/>ONLY their motors" .- Motors_DB

    %% =================== LEGEND ===================
    subgraph Legend ["📖 KEY CONCEPTS"]
        direction LR
        L1["🖥️ Admin: Manages inventory<br/>Sees Starter-centric view"]:::admin
        L2["📱 User: Controls motors<br/>Sees Motor-centric view"]:::user
        L3["📦 Starter = Physical Device<br/>� Motor = Virtual Control Unit"]:::api
    end
