import * as v from "valibot";
import { GATEWAY_IDENTIFIER_REQUIRED, GATEWAY_LABEL_MIN_LEN, GATEWAY_LABEL_REQUIRED, GATEWAY_NUMBER_MIN_LEN, GATEWAY_NUMBER_REQUIRED, INVALID_USER_ID, GATEWAY_NAME_REQUIRED, GATEWAY_NAME_MIN_LEN, MAC_MIN_LEN, MAC_REQUIRED, PCB_MIN_LEN, PCB_NUMBER_REQUIRED } from "../../constants/app-constants.js";


export const vAddGateway = v.object({
  name: v.nullish(v.optional(v.pipe(
    v.string(),
    v.transform(value => value.trim()),
    v.minLength(3, GATEWAY_NAME_MIN_LEN),
  ))),
  gateway_number: v.pipe(
    v.string(GATEWAY_NUMBER_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(GATEWAY_NUMBER_REQUIRED),
    v.minLength(3, GATEWAY_NUMBER_MIN_LEN),
  ),
  label: v.nullish(v.optional(v.pipe(v.string(), v.transform(value => value.trim())))),
  mac_address: v.pipe(
    v.string(MAC_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(MAC_REQUIRED),
    v.minLength(3, MAC_MIN_LEN),
  ),
  pcb_number: v.pipe(
    v.string(PCB_NUMBER_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(PCB_NUMBER_REQUIRED),
    v.minLength(3, PCB_MIN_LEN),
  ),
  location_id: v.nullish(v.optional(v.number())),
});


export type ValidatedAddGateway = v.InferOutput<typeof vAddGateway>;

export const vUpdateGatewayLabel = v.object({
  label: v.pipe(
    v.string(GATEWAY_LABEL_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(GATEWAY_LABEL_REQUIRED),
    v.minLength(3, GATEWAY_LABEL_MIN_LEN),
  ),
});

export type ValidatedUpdateGatewayLabel = v.InferOutput<typeof vUpdateGatewayLabel>;

export const vRenameGateway = v.object({
  name: v.pipe(
    v.string(GATEWAY_NAME_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(GATEWAY_NAME_REQUIRED),
    v.minLength(3, GATEWAY_NAME_MIN_LEN),
  ),
});

export type ValidatedRenameGateway = v.InferOutput<typeof vRenameGateway>;

export const vAssignGatewayToUser = v.pipe(
  v.object({
    mac_address: v.nullish(v.optional(v.pipe(v.string(), v.transform(value => value.trim()), v.minLength(3, MAC_MIN_LEN)))),
    pcb_number: v.nullish(v.optional(v.pipe(v.string(), v.transform(value => value.trim()), v.minLength(3, PCB_MIN_LEN)))),
    gateway_number: v.nullish(v.optional(v.pipe(v.string(), v.transform(value => value.trim()), v.minLength(3, GATEWAY_NUMBER_MIN_LEN)))),
    name: v.nullish(v.optional(v.pipe(v.string(), v.transform(value => value.trim()), v.minLength(3, GATEWAY_NAME_MIN_LEN)))),
    user_id: v.nullish(v.optional(v.number(INVALID_USER_ID))),
  }),
  v.check((data) => {
    const mac = (data as any).mac_address?.trim();
    const pcb = (data as any).pcb_number?.trim();
    const gno = (data as any).gateway_number?.trim();
    const name = (data as any).name?.trim();
    return Boolean(mac || pcb || gno || name);
  }, GATEWAY_IDENTIFIER_REQUIRED),
);

export type ValidatedAssignGatewayToUser = v.InferOutput<typeof vAssignGatewayToUser>;

export const vUpdateGatewayNumber = v.object({
  gateway_number: v.pipe(
    v.string(GATEWAY_NUMBER_REQUIRED),
    v.transform(value => value.trim()),
    v.nonEmpty(GATEWAY_NUMBER_REQUIRED),
    v.minLength(3, GATEWAY_NUMBER_MIN_LEN),
  ),
});

export type ValidatedUpdateGatewayNumber = v.InferOutput<typeof vUpdateGatewayNumber>;
