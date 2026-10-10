import { useCallback, useState } from 'react';
import type { MeasurementSystem } from '../lib/measurements';
import { readPreference, savePreference } from '../lib/preferences';

export function useMeasurements() {
  const [measurements, setMeasurements] = useState<MeasurementSystem>(
    () => readPreference('measurements') ?? 'metric',
  );
  const chooseMeasurements = useCallback((choice: MeasurementSystem) => {
    setMeasurements(choice);
    savePreference('measurements', choice);
  }, []);
  return { measurements, chooseMeasurements };
}
