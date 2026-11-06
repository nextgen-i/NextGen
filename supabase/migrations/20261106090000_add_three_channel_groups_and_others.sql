-- NextGen: add three persistent channel groups and support an "Others" platform slot.
-- Existing channels are preserved and assigned to Channel Group 1.
ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS group_number smallint NOT NULL DEFAULT 1;

UPDATE public.channels
SET group_number = 1
WHERE group_number IS NULL OR group_number NOT BETWEEN 1 AND 3;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_group_number_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_group_number_check
  CHECK (group_number BETWEEN 1 AND 3)
  NOT VALID;

ALTER TABLE public.channels
  VALIDATE CONSTRAINT channels_group_number_check;

ALTER TABLE public.channels
  DROP CONSTRAINT IF EXISTS channels_platform_check;

ALTER TABLE public.channels
  ADD CONSTRAINT channels_platform_check
  CHECK (platform IN ('youtube','facebook','instagram','threads','others'))
  NOT VALID;

ALTER TABLE public.channels
  VALIDATE CONSTRAINT channels_platform_check;

CREATE INDEX IF NOT EXISTS channels_owner_group_platform_created_idx
  ON public.channels(owner_id, group_number, platform, created_at DESC);
