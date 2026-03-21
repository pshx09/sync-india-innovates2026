-- Step 1: Ensure PostGIS is enabled
CREATE EXTENSION IF NOT EXISTS postgis;

-- Step 2: Create the tickets table
CREATE TABLE IF NOT EXISTS tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES users(id),
    user_phone VARCHAR(20),
    issue_type VARCHAR(100) NOT NULL,
    severity VARCHAR(50) NOT NULL,
    image_url TEXT,
    status VARCHAR(50) DEFAULT 'Open',
    description TEXT,
    department VARCHAR(100),
    location GEOMETRY(Point, 4326) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Step 3: Create a spatial index for faster geographic queries
CREATE INDEX IF NOT EXISTS tickets_location_idx ON tickets USING GIST (location);

-- Step 4: Safe migration for existing databases (add columns if missing)
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='description') THEN
        ALTER TABLE tickets ADD COLUMN description TEXT;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='department') THEN
        ALTER TABLE tickets ADD COLUMN department VARCHAR(100);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='tickets' AND column_name='user_id') THEN
        ALTER TABLE tickets ADD COLUMN user_id UUID REFERENCES users(id);
    END IF;
END $$;
