import * as v from "valibot";
import { macAddressValidator, pcbNumberValidator, serialNoValidator, starterBoxTitleValidator, starterNumberValidator } from "./common-validations.js";
export const vAddStarter = v.object({
    name: starterBoxTitleValidator,
    serial_number: serialNoValidator,
    pcb_number: pcbNumberValidator,
    starter_number: starterNumberValidator,
    mac_address: macAddressValidator,
    //  Optional fields
    gateway_id: v.optional(v.union([v.number(), v.null()])),
});
