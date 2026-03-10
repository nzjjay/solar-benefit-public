// Simple solar benefit projection logic

function money(x) { return Math.max(0, Number(x || 0)); }

export function calculateProjection(inputs, years = 10) {
  // Inputs (basic validation)
  const installationCost = money(inputs.installationCost);
  const dailyFixed = money(inputs.dailyFixedCharge);
  const dayRate = money(inputs.dayRate);
  const nightRate = money(inputs.nightRate);
  const exportRate = money(inputs.exportRate);
  const inflation = (Number(inputs.priceInflation) || 0) / 100;

  const numPanels = Number(inputs.numPanels) || 0;
  const panelWatt = Number(inputs.panelWattage) || 0;
  const solarHours = Number(inputs.solarHoursPerDay) || 4;
  const inverterKw = Number(inputs.inverterKw) || 0;

  const usageDay = Number(inputs.usageDayKwhPerDay) || 0;
  const usageNight = Number(inputs.usageNightKwhPerDay) || 0;
  const batteryEnabled = !!inputs.batteryEnabled;
  const batteryKwh = Number(inputs.batteryKwh) || 0;

  // Estimate system size and daily generation
  const systemKw = (numPanels * panelWatt) / 1000; // kW
  const dailyGeneration = Math.min(systemKw * solarHours, inverterKw * solarHours); // kWh/day available from panels limited by inverter

  const yearsArr = [];
  let cumulative = 0;
  let paybackYear = null;

  // assume fixed daily fixed charges per day, and day/night usage
  for (let y = 1; y <= years; y++) {
    const yearIndex = y - 1;
    const priceMultiplier = Math.pow(1 + inflation, yearIndex);

    const annualGeneration = dailyGeneration * 365; // kWh/year

    // naive distribution: solar generation first covers daytime usage; surplus exported or stored
    const annualDayUsage = usageDay * 365;
    const annualNightUsage = usageNight * 365;

    // battery: allows shifting up to batteryKwh per day from day to night, but limited by generation surplus
    const dailyGenerationThisYear = dailyGeneration;
    let dailySurplus = Math.max(0, dailyGenerationThisYear - usageDay);

    let dailyBatteryDispatch = 0;
    if (batteryEnabled && batteryKwh > 0) {
      // simplistic: battery usable energy per day equals batteryKwh, limited by surplus
      dailyBatteryDispatch = Math.min(batteryKwh, dailySurplus);
      dailySurplus = Math.max(0, dailySurplus - dailyBatteryDispatch);
    }

    // energy offsets: daytime consumption offset by generation used directly; night consumption offset by battery dispatch
    const annualDayOffset = Math.min(annualGeneration, annualDayUsage) ;
    const annualBatteryOffset = Math.min(dailyBatteryDispatch * 365, annualNightUsage);

    // exported energy = generation - used for day - charged to battery
    const annualExport = Math.max(0, annualGeneration - annualDayOffset - (dailyBatteryDispatch * 365));

    // savings: avoided cost from offsetting day usage at dayRate and night usage at nightRate (via battery)
    const savingsFromDay = annualDayOffset * dayRate * priceMultiplier;
    const savingsFromNight = annualBatteryOffset * nightRate * priceMultiplier;
    const savingsFromExport = annualExport * exportRate * priceMultiplier;

    const annualFixedCharge = dailyFixed * 365 * priceMultiplier;

    const annualSavings = savingsFromDay + savingsFromNight + savingsFromExport - annualFixedCharge;

    cumulative += annualSavings;

    if (paybackYear === null && cumulative >= installationCost) paybackYear = y;

    yearsArr.push({
      year: y,
      generation: annualGeneration,
      dayOffset: annualDayOffset,
      batteryOffset: annualBatteryOffset,
      export: annualExport,
      savings: annualSavings,
      cumulativeSavings: cumulative,
    });
  }

  const totalSavings = yearsArr.reduce((s, r) => s + r.savings, 0);

  return { years: yearsArr, totalSavings, paybackYear };
}
