#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script final para limpiar y transformar el archivo 04_posts_cleaned.sql
Convierte sentencias INSERT con subconsultas a INSERT IGNORE con valores directos
"""

import re
import sys
from pathlib import Path

def escape_sql_string(text):
    """Escapa caracteres especiales en strings SQL"""
    if text is None:
        return 'NULL'
    
    # Convertir 'NULL' string a NULL real
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
    """Extrae los nombres de las columnas de una sentencia INSERT"""
    match = re.search(r'INSERT INTO xf_post \((.*?)\)', insert_statement, re.IGNORECASE | re.DOTALL)
    if match:
        columns_str = match.group(1)
        # Limpiar espacios y dividir por comas
        columns = [col.strip() for col in columns_str.split(',')]
        return columns
    return []

def convert_subquery_to_value(subquery, default_value=9999):
    """Convierte una subconsulta a un valor directo"""
    # Si es una subconsulta de user_id, reemplazar con 9999
    if 'SELECT user_id FROM xf_user WHERE username' in subquery:
        return str(default_value)
    
    # Si es una subconsulta de thread_id, reemplazar con 9999
    if 'SELECT thread_id FROM xf_thread WHERE' in subquery:
        return str(default_value)
    
    # Para otras subconsultas, intentar extraer un valor o usar default
    return str(default_value)

def process_insert_statement(statement):
    """Procesa una sentencia INSERT completa"""
    # Extraer columnas
    columns = extract_column_names(statement)
    if not columns:
        return None
    
    # Buscar la parte SELECT de la sentencia
    select_match = re.search(r'SELECT\s+(.*)', statement, re.IGNORECASE | re.DOTALL)
    if not select_match:
        return None
    
    select_part = select_match.group(1)
    
    # Dividir los valores de manera más simple
    # Primero, reemplazar subconsultas con valores por defecto
    select_part = re.sub(r'\(SELECT user_id FROM xf_user WHERE username[^)]+\)', '9999', select_part)
    select_part = re.sub(r'\(SELECT thread_id FROM xf_thread WHERE[^)]+\)', '9999', select_part)
    
    # Ahora dividir por comas, pero respetando strings
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
    
    # Agregar el último valor
    if current_value.strip():
        values.append(current_value.strip())
    
    # Procesar cada valor
    processed_values = []
    for value in values:
        value = value.strip()
        
        # Si es un string, escapar
        if value.startswith("'") and value.endswith("'"):
            processed_value = escape_sql_string(value)
        else:
            processed_value = value
        
        processed_values.append(processed_value)
    
    # Agregar valores NULL para las columnas faltantes
    while len(processed_values) < len(columns):
        processed_values.append('NULL')
    
    # Construir la nueva sentencia INSERT IGNORE
    columns_str = ', '.join(columns)
    values_str = ', '.join(processed_values)
    
    return f"INSERT IGNORE INTO xf_post ({columns_str}) VALUES ({values_str});"

def clean_posts_file(input_file, output_file):
    """Limpia el archivo de posts completo"""
    print(f"Processing {input_file}...")
    
    with open(input_file, 'r', encoding='utf-8') as f:
        content = f.read()
    
    # Dividir en sentencias individuales
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
            # Buscar el final de la sentencia
            if line.endswith(';') or line.endswith("'") or line.endswith('"'):
                # Verificar si la siguiente línea es un nuevo INSERT
                if i + 1 < len(lines) and lines[i + 1].strip().startswith('INSERT INTO xf_post'):
                    statements.append(current_statement)
                    current_statement = ""
                    in_statement = False
        
        i += 1
    
    # Agregar la última sentencia si existe
    if current_statement:
        statements.append(current_statement)
    
    print(f"Found {len(statements)} INSERT statements")
    
    # Procesar cada sentencia
    processed_statements = []
    for i, statement in enumerate(statements):
        if i % 100 == 0:
            print(f"Processing statement {i+1}/{len(statements)}")
        
        processed = process_insert_statement(statement)
        if processed:
            processed_statements.append(processed)
        else:
            print(f"Warning: Could not process statement {i+1}")
            # Debug: mostrar la sentencia problemática
            if i < 3:  # Solo mostrar las primeras 3 para debug
                print(f"Problematic statement: {statement[:300]}...")
    
    # Escribir el archivo de salida
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