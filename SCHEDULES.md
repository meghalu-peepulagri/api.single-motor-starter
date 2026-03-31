1. Single motor can be on and off using mqtt topics
2. We will get ACK from device/motor once we send mqtt payload
3. Based on that we will add motor status as on/off
4. Once motor got on we will get live data for each 2 mins votlage and currents
5. We have motor Running mode. Manual mode or Auto mode 
   Manual mode need to on and off any time.
   Auto mode is when powers on it will automatically turned on and off 
6. We wil get alerts
7. 0 - Manual , 1- Auto
8. Schedule will bet like start_date and end_date and start time and end time , Cyclic or One Time

     24-03
     30-03
     06AM -07AM
      Cyclic : zig zag: 10 min on 1 min off [with break]
      One Time: Complete one hour [without breaks] we may expect breaks while power cuts. to fill that breaks we can extends schedules if your opt loss&recovery



{
  ""T"": SCHEDULE CREATION,
  ""S"": 1,
  ""D"": {
    ""idx"": 1,
    ""last"": 0,
    ""sch_cnt"": 6,
    ""plr"" : 30, 
    ""m1"": [
      {
        ""id"": 1,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 600,
        ""et"": 700,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 2,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 800,
        ""et"": 900,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 3,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1000,
        ""et"": 1100,
        ""en"": 1,
        ""cy"": 1,
        ""on"": 10,
        ""off"": 5,
        ""pwr_rec"": 0
      },
      {
        ""id"": 4,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1200,
        ""et"": 1300,
        ""en"": 1,
        ""pwr_rec"": 0
      },
      {
        ""id"": 5,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1400,
        ""et"": 1500,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 6,
        ""sd"": 260607,
        ""ed"": 260607,
        ""st"": 630,
        ""et"": 730,
        ""en"": 1,
        ""cy"": 1,
        ""on"": 15,
        ""off"": 5,
        ""pwr_rec"": 0
      }
    ]
  }
}"


	"idx = Index of Payload -> Optional
last = 1 = No Pending Schedules, 0 = Extra Schedules
id = Schedule Id for Array of Schedule
sd = Start Date of Schedule
ed = End Date of Schedule
st = Sart Time of Schedule
et = End Time of Schedule
en = Enable or Disable
cy = Cyclic or Non Cyclic
on = Motor On Time
off = Motor Off Time
plr = Maximum Power Loss Run time"




Schedule Creation	"{
  ""T"": SCHEDULE CREATION,
  ""S"": 1,
  ""D"": {
    ""idx"": 1,
    ""last"": 0,
    ""sch_cnt"": 6,
    ""plr"" : 30, 
    ""m1"": [
      {
        ""id"": 1,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 600,
        ""et"": 700,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 2,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 800,
        ""et"": 900,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 3,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1000,
        ""et"": 1100,
        ""en"": 1,
        ""cy"": 1,
        ""on"": 10,
        ""off"": 5,
        ""pwr_rec"": 0
      },
      {
        ""id"": 4,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1200,
        ""et"": 1300,
        ""en"": 1,
        ""pwr_rec"": 0
      },
      {
        ""id"": 5,
        ""sd"": 260606,
        ""ed"": 260606,
        ""st"": 1400,
        ""et"": 1500,
        ""en"": 1,
        ""pwr_rec"": 1
      },
      {
        ""id"": 6,
        ""sd"": 260607,
        ""ed"": 260607,
        ""st"": 630,
        ""et"": 730,
        ""en"": 1,
        ""cy"": 1,
        ""on"": 15,
        ""off"": 5,
        ""pwr_rec"": 0
      }
    ]
  }
}"	"idx = Index of Payload -> Optional
last = 1 = No Pending Schedules, 0 = Extra Schedules
id = Schedule Id for Array of Schedule
sd = Start Date of Schedule
ed = End Date of Schedule
st = Sart Time of Schedule
et = End Time of Schedule
en = Enable or Disable
cy = Cyclic or Non Cyclic
on = Motor On Time
off = Motor Off Time
plr = Maximum Power Loss Run time"	"{
 ""T"": SCHEDULE CREATION ACK,
 ""S"": 1,
 ""D"": 4
}"
Stopping a Schedule	"{
 ""T"": SHEDULE UPDATE,
 ""S"": 1,
 ""D"": {
      ""cmd"": 1, 
      ""ids"": 10
       }
}"	"-----------------------------------------------------------------------------------
Command  ID |   Action            |     Description                                                   |
-----------------------------------------------------------------------------------
     1                   |   Stop / Pause |  Temporarily halts the specific schedule.
     2                  |   Restart           |  Resumes a paused schedule.
     3                  |   Delete             |  Removes the schedule object from the Flash
-----------------------------------------------------------------------------------
Schedule ID : 16 | 15 | 16 | 14 | 13 | 12 | 11 | 10 | 9 | 8 | 7 | 6 | 5 | 4 | 3 | 2 | 1
Bits                :  0     0     0     0     0     0      0     0    0   0   0   0   0   0   0   0   0
-----------------------------------------------------------------------------------
Schedule ID,   |     Bit Value (2n−1),  |     Binary Position                                   |
-----------------------------------------------------------------------------------
Sch 1,               |          1,                        |  0000 0000 0000 0001                          |
Sch 2,               |         2,                         |  0000 0000 0000 0010                          |
Sch 3,               |         4,                         |  0000 0000 0000 0100                          |
Sch 4,               |         8,                         |  0000 0000 0000 1000                          |
Sch 10,             |        512,                     |  0000 0010 0000 0000                          |
Sch 16,             |       32768,                  | 1000 0000 0000 0000                          |
-----------------------------------------------------------------------------------"	"{
 ""T"": SHEDULE UPDATE ACK,
 ""S"": 1,
 ""D"": {
       ""ids"": 10,
       ""ack"": 1
       }
}"
Restarting a Schedule	"{
 ""T"": SHEDULE UPDATE,
 ""S"": 1,
 ""D"": {
      ""cmd"": 2, 
      ""ids"": 10
       
       }
}"		"{
 ""T"": SHEDULE UPDATE ACK,
 ""S"": 1,
 ""D"": {
       ""ids"": 10,
       ""ack"": 2
       }
}"
"Deleting Multiple Schedule
Used to permanently remove a schedule from the device memory (EEPROM)."	"{
 ""T"": SHEDULE UPDATE,
 ""S"": 1,
 ""D"": {
       ""ids"": 10,
       ""cmd"": 3
       }
}"		"{
 ""T"": SHEDULE UPDATE ACK,
 ""S"": 1,
 ""D"": {
       ""ids"": 10,
       ""ack"": 3
       }
}"
"Periodic Live Data Sending on Scheduling Running
Live Data Publishing on Schedule Running Live Payload

Non  Cyclic Schedule"	"{ ""T"": LIVE DATA,
  ""S"": 85,
  ""D"": {
    ""G01"": {
      ""p_v"": 2,
      ""pwr"": 1,
      ""llv"": [ 442.00, 420.98, 435.23 ],
      ""m1"": {
        ""mode"": 1,
        ""m_s"": 0,
        ""amp"": [0.0,0.0,0.1],
        ""id"": 3,
        ""st"": 630,
        ""cy"": 0,
        ""rt"": 40,
        ""flt"": 4095,
        ""alt"": 4095,
        ""l_on"": 1,
        ""l_of"": 0
      },
      ""m2"": {
        ""mode"": 1,
        ""m_s"": 0,
        ""amp"": [0.0,0.0,0.1],
        ""flt"": 4095,
        ""alt"": 4095,
        ""id"": 2,
        ""st"": 630,
        ""cy"": 0,
        ""rt"": 40,
        ""l_on"": 1,
        ""l_of"": 0
      }
    },
    ""ct"": ""25/01/04,12:19:43""
  }
}
}"	"| Field  |   Meaning     |
| --------  | -------------------- |
|  m1    |  Motor 1        |
|  m2    |  Motor 2        |
|  id       |  Schedule id |
|  st       |  Start time    |
|  cy      |  cyclic            |
|  rt       |  run time        |

{ ""T"": 41,
  ""S"": 85,
  ""D"": {
    ""G01"": {
      ""p_v"": 2,
      ""pwr"": 1,
      ""llv"": [ 442.00, 420.98, 435.23 ],
      ""m1"": {
        ""mode"": 1,
        ""m_s"": 0,
        ""amp"": [0.0,0.0,0.1],
        ""id"": 3,
        ""st"": 630,
        ""cy"": 0,
        ""rt"": 40,
        ""flt"": 4095,
        ""alt"": 4095,
        ""l_on"": 1,
        ""l_of"": 0
      },
      ""m2"": {
        ""mode"": 1,
        ""m_s"": 0,
        ""amp"": [0.0,0.0,0.1],
        ""flt"": 4095,
        ""alt"": 4095,
        ""id"": 2,
        ""st"": 630,
        ""cy"": 0,
        ""rt"": 40,
        ""l_on"": 1,
        ""l_of"": 0
      }
    },
    ""ct"": ""25/01/04,12:19:43""
  }
}"	-


Device Synchronisation After the Device Boot 	"{
 ""T"": DEVICE SYNCH REQUEST
 ""S"": 1,
 ""D"": {
       ""m1"" : 0,
       ""m2"" : 0 
      }
}"	" T : Device Sync Request
 m1  :  Motor 1 State
 m2   : Motor 2 State"	"{
  ""T"": DEVICE SYNCH REQUEST ACK,
  ""D"": {
    ""rtc"": 72235,
    ""m1"": {
              ""id"": 3,
             ""rt"": 40,
             ""cy"": 0
              },
   ""m2"": {
            ""id"": 4,
            ""rt"": 40,
            ""cy"": 1
             }
}"
"Schedule Status Request
From the Cloud to Device with respect Motor"	"{
 ""T"": SCHEDULE STATUS READ REQUEST
 ""S"": 1,
 ""D"": {
    ""m1"":1
    }
}"	" T  =  SCHEDULE READ REQUEST
 m1 : Motro Schedule Request"	"{
  ""T"": SCHEDULE STATUS READ REQUEST ACK,
  ""S"": 1,
  ""D"": {
    ""idx"": 1,
    ""last"": 1,
    ""sch_cnt"": 6,
    ""plr"": 30,

    ""m"": [
      {
        ""mid"": 1,
        ""sch"": [
          {
            ""id"": 1,
            ""sd"": 260606,
            ""ed"": 260606,
            ""st"": 630,
            ""et"": 730,
            ""cy"": 0,
            ""ack"": 1
          },
          {
            ""id"": 2,
            ""sd"": 260606,
            ""ed"": 260606,
            ""st"": 900,
            ""et"": 1000,
            ""cy"": 1,
            ""on"": 10,
            ""off"": 5,
            ""ack"": 1
          },
          {
            ""id"": 3,
            ""sd"": 260606,
            ""ed"": 260606,
            ""st"": 1000,
            ""et"": 1100,
            ""cy"": 0,
            ""ack"": 1
          }
        ]
      }
    ]
  }
}"