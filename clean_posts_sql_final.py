#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Final script to clean and transform the 04_posts_cleaned.sql file
Converts INSERT statements with subqueries to INSERT IGNORE with direct values
"""

import re
import sys
from pathlib import Path

def escape_sql_string(text):
    """Escapa caracteres especiales en strings SQL"""
    if text is None:
        return 'NULL'
    
    # Convert 'NULL' string to real NULL
    if text.strip() == "'NULL'":
        return 'NULL'
    
    # Si ya es NULL sin comillas, mantenerlo
    if text.strip() == 'NULL':
        return 'NULL'
    
    # Escapar caracteres especiales
    text = text.replace("\\", "\\\\")
    text = text.replace("'", "\\'")
    text = text.replace('"', '\\"')
    text = text.replace('\n', '\\n')
    text = text.replace('\r', '\\r')
    text = text.replace('\t', '\\t')
    
    return text

def extract_column_names(insert_statement):
    """Extract column names from an INSERT statement"""
    match = re.search(r'INSERT INTO xf_post \((.*?)\)', insert_statement, re.IGNORECASE | re.DOTALL)
    if match:
        columns_str = match.group(1)
        # Clean spaces and split by commas
        columns = [col.strip() for col in columns_str.split(',')]
        return columns
    return []

def convert_subquery_to_value(subquery, default_value=9999):
    """Convert a subquery to a direct value"""
    # If it's a user_id subquery, replace with 9999
    if 'SELECT user_id FROM xf_user WHERE username' in subquery:
        return str(default_value)
    
    # If it's a thread_id subquery, replace with 9999
    if 'SELECT thread_id FROM xf_thread WHERE' in subquery:
        return str(default_value)
    
    # For other subqueries, try to extract a value or use default
    return str(default_value)

def process_insert_statement(statement):
    """Process a complete INSERT statement"""
    # Extract columns
    columns = extract_column_names(statement)
    if not columns:
        return None
    
    # Find the SELECT part of the statement
    select_match = re.search(r'SELECT\s+(.*)', statement, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return None
    
    select_part = select_match.group(1)
    
    # Split values in a simpler way
    # First, replace subqueries with default values
    select_part = re.sub(r'\(SELECT user_id FROM xf_user WHERE username[^)]+\)', '9999', select_part)
    select_part = re.sub(r'\(SELECT thread_id FROM xf_thread WHERE[^)]+\)', '9999', select_part)
    
    # Now split by commas, but respect strings
    values = []
    current_value = ""
    in_string = False
    string_char = None
    paren_count = 0
    
    for char in select_part:
        if char in ["'", '"'] and not in_string:
            in_string = True
            string_char = char
        elif char == string_char and in_string:
            # Verificar si no es un escape
            if len(current_value) > 0 and current_value[-1] != '\\':
                in_string = False
                string_char = None
        elif char == '(' and not in_string:
            paren_count += 1
        elif char == ')' and not in_string:
            paren_count -= 1
        elif char == ',' and paren_count == 0 and not in_string:
            values.append(current_value.strip())
            current_value = ""
            continue
        
        current_value += char
    
            # Add the last value
        if current_value.strip():
            values.append(current_value.strip())
    
        # Process each value
        processed_values = []
        for value in values:
            value = value.strip()
            
            # If it's a string, escape it
            if value.startswith("'") and value.endswith("'"):
                processed_value = escape_sql_string(value)
            else:
                processed_value = value
            
            processed_values.append(processed_value)
        
        # Add NULL values for missing columns
        while len(processed_values) < len(columns):
            processed_values.append('NULL')
        
        # Build the new INSERT IGNORE statement
    columns_str = ', '.join(columns)
    values_str = ', '.join(processed_values)
    
    return f"INSERT IGNORE INTO xf_post ({columns_str}) VALUES ({values_str});"

def clean_posts_file(input_file, output_file):
    """Clean the complete posts file"""
    print(f"Processing {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Split into individual statements
    statements = []
    current_statement = ""
    in_statement = False
    
    lines = content.split('\n')
    i = 0
    while i < len(lines):
        line = lines[i].strip()
        
        if not line or line.startswith('--'):
            i += 1
            continue
            
        if line.startswith('INSERT INTO xf_post'):
            if current_statement:
                statements.append(current_statement)
            current_statement = line
            in_statement = True
        elif in_statement:
            current_statement += " " + line
            # Find the end of the statement
            if line.endswith(';') or line.endswith("'") or line.endswith('"'):
                # Check if the next line is a new INSERT
                if i + 1 < len(lines) and lines[i + 1].strip().startswith('INSERT INTO xf_post'):
                    statements.append(current_statement)
                    current_statement = ""
                    in_statement = False
        
        i += 1
    
    # Add the last statement if it exists
    if current_statement:
        statements.append(current_statement)
    
    print(f"Found {len(statements)} INSERT statements")
    
    # Process each statement
    processed_statements = []
    for i, statement in enumerate(statements):
        if i % 100 == 0:
            print(f"Processing statement {i+1}/{len(statements)}")
        
        processed = process_insert_statement(statement)
        if processed:
            processed_statements.append(processed)
        else:
            print(f"Warning: Could not process statement {i+1}")
            # Debug: show the problematic statement
            if i < 3:  # Only show the first 3 for debug
                print(f"Problematic statement: {statement[:300]}...")
    
    # Write the output file
    with open(output_file, 'w', encoding='utf-8') as f:
        f.write("-- Cleaned and transformed posts for XenForo 2.x\n")
        f.write("-- Generated from 04_posts_cleaned.sql\n\n")
        
        for statement in processed_statements:
            f.write(statement + "\n")
    
    print(f"Successfully processed {len(processed_statements)} statements")
    print(f"Output written to {output_file}")

if __name__ == "__main__":
    input_file = "cleaned_sql_files/04_posts_cleaned.sql"
    output_file = "cleaned_sql_files/04_posts_cleaned_final.sql"
    
    if not Path(input_file).exists():
        print(f"Error: Input file {input_file} not found")
        sys.exit(1)
    
    clean_posts_file(input_file, output_file) 