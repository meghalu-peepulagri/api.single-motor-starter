
export function prepareDeviceConfigurationPayload(data: any) {
  const calculatePercentage = (field: number, flc: number) => {
    if (field == null || flc == null) return 0;
    return parseFloat(((field / 100) * flc).toFixed(2));
  };

  return {
    D: {
      dvc_c: {
        allflt_en: data.allflt_en,
        flc: data.flc,
        as_dly: data.as_dly,
        ipf: data.ipf,
        lvf: data.lvf,
        hvf: data.hvf,
        vif: data.vif,
        paminf: data.paminf,
        pamaxf: data.pamaxf,
        lvr: data.lvr,
        hvr: data.hvr,
        drf: calculatePercentage(data.drf, data.flc),
        olf: calculatePercentage(data.olf, data.flc),
        lrf: calculatePercentage(data.lrf, data.flc),
        opf: data.opf,
        cif: data.cif,
        olr: calculatePercentage(data.olr, data.flc),
        lrr: calculatePercentage(data.lrr, data.flc),
        cir: data.cir,
        pr_flt_en: data.pr_flt_en
      }
    }
  };
}