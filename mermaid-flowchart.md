```mermaid

graph TB
    Title[iDhara]

    Admin[Admin]
    User[User]
    Locations[Locations]
    Devices[Devices]
    Mobile[Mobile App]

    %% ADMIN ACTIONS
    Admin -- Creates --> User
    Admin -- Adds / Assigns --> Devices

    %% USER ACTIONS
    User -- Assigns --> Devices
    Devices -- Installed At --> Locations

    %% COMMUNICATION (MQTT)
    Mobile -- Publish Control Topics --> Devices
    Devices -- ACK / Status Topics --> Mobile
    Devices --Live Data--> Mobile
