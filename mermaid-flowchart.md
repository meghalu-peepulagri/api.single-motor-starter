```mermaid

graph TB
  %% Project title as a top node (no relations)
  Title["<b><span style='font-size:24px; color:black'>iDhara</span></b>"]

  %% Nodes 
  PA["<b><span style='color:black; font-size:16px;'>👑 Admin PA Team</span></b>"]
  Users["<b><span style='color:black; font-size:16px;'>👥 Users</span></b>"]
  Locations["<b><span style='color:black; font-size:16px;'>📍 Locations</span></b>"]
  Devices["<b><span style='color:black; font-size:16px;'>📟 Devices</span></b>"]
  Motor["<b><span style='color:black; font-size:16px;'>🛞 Motor</span></b>"]
  Parameters["<b><span style='color:black; font-size:16px;'>Parameters<br>⚡ Voltage | 🔋 Current</span></b>"]

  %%  relations
  PA -- Adds / Self-Register --> Users
  Users -- Multiple --> Locations
  Locations -- Multiple --> Devices
  Devices -- Single --> Motor

  %% Devices to users relations
  PA -- Adds --> Devices
  Devices -- Assign --> Locations
  Locations -- Wise --> Users

  %% Devices to parameters
  Parameters -- Data getting from topics--> Devices

  %% Styling arrows
  linkStyle 0,1,2,3,4 stroke:#28a745,stroke-width:3px
  linkStyle 5,6,7 stroke:#ff6600,stroke-width:2px,stroke-dasharray:5 5

  style Title fill:#ffffff,stroke:#000000,stroke-width:0px
  style PA fill:#e0f7fa,stroke:#0288d1,stroke-width:2px,rx:10,ry:10
  style Users fill:#f1f8e9,stroke:#689f38,stroke-width:2px,rx:10,ry:10
  style Locations fill:#fff3e0,stroke:#ef6c00,stroke-width:2px,rx:10,ry:10
  style Devices fill:#e8eaf6,stroke:#3f51b5,stroke-width:2px,rx:10,ry:10
  style Motor fill:#fce4ec,stroke:#c2185b,stroke-width:2px,rx:10,ry:10
  style Parameters fill:#fff9c4,stroke:#fbc02d,stroke-width:2px,rx:10,ry:10
  linkStyle 7 stroke:#0288d1,stroke-width:2px,stroke-dasharray:3 3
