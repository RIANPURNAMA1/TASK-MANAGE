import { useState, type FormEvent } from 'react';
import { errorMessage, fieldErrors } from '../../lib/errors';

/** Structural subset of a zod schema, so the web app needn't depend on zod directly. */
interface ValidationSchema {
  safeParse(data: unknown):
    | { success: true }
    | { success: false; error: { flatten(): { fieldErrors: Record<string, string[] | undefined> } } };
}

/**
 * Minimal form state helper: zod validation on submit, server field errors merged in,
 * and a single top-level error message for anything else.
 */
export function useZodForm<T extends Record<string, unknown>>(
  schema: ValidationSchema,
  initial: T,
  onValid: (values: T) => Promise<void>,
) {
  const [values, setValues] = useState<T>(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const set = <K extends keyof T>(key: K, value: T[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    setErrors((e) => ({ ...e, [key as string]: '' }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setFormError(null);
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const flat = parsed.error.flatten().fieldErrors;
      setErrors(Object.fromEntries(Object.entries(flat).map(([k, v]) => [k, v?.[0] ?? ''])));
      return;
    }
    setSubmitting(true);
    try {
      await onValid(values);
    } catch (error) {
      const fields = fieldErrors(error);
      if (Object.keys(fields).length) setErrors(fields);
      else setFormError(errorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  return { values, set, errors, formError, setFormError, submitting, onSubmit };
}
