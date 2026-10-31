import {DatabaseSync} from 'node:sqlite';
import fs from 'node:fs';
export function sqliteD1(filename=':memory:'){
  const db=new DatabaseSync(filename);
  if(!db.prepare("SELECT name FROM sqlite_master WHERE name='traffic_events'").get())db.exec(fs.readFileSync(new URL('../drizzle/0000_traffic.sql',import.meta.url),'utf8').replaceAll('--> statement-breakpoint',''));
  const adapter={db,prepare(sql){return {args:[],bind(...args){return {...this,args};},async first(){return db.prepare(sql).get(...this.args);},async run(){return db.prepare(sql).run(...this.args);},async all(){return {results:db.prepare(sql).all(...this.args)};}};},async batch(statements){db.exec('BEGIN');try{const out=[];for(const s of statements)out.push(await s.all());db.exec('COMMIT');return out;}catch(err){db.exec('ROLLBACK');throw err;}}};return adapter;
}
