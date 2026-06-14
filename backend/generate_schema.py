import sys
import os

# Ensure backend directory is in path
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from sqlalchemy.schema import CreateTable
from db.session import engine, Base
# Import all models to ensure they are registered with Base
from models.database import Customer, Order, Campaign, Communication, Event

def generate_sql_schema(output_file: str = "supabase_schema.sql"):
    """
    Generates the raw PostgreSQL schema from the SQLAlchemy models.
    This can be used to manually execute in the Supabase SQL Editor.
    """
    with open(output_file, "w") as f:
        f.write("-- Supabase PostgreSQL Schema for XenoPilot\n\n")
        f.write("CREATE EXTENSION IF NOT EXISTS \"uuid-ossp\";\n\n")
        
        # Iterate over all registered tables
        for name, table in Base.metadata.tables.items():
            create_statement = CreateTable(table).compile(engine)
            f.write(f"-- Table: {name}\n")
            f.write(str(create_statement).strip() + ";\n\n")
            
    print(f"Schema successfully generated at {output_file}")

if __name__ == "__main__":
    generate_sql_schema()
