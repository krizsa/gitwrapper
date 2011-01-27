/**
 * Ajax.org
 *
 * @copyright 2010, Ajax.org Services B.V.
 * @license LGPLv3 <http://www.gnu.org/licenses/lgpl-3.0.txt>
 * @author Gabor Krizsanits 
 */

//define(function(require, exports, module) {

var exec = require('child_process').exec,
	spawn = require('child_process').spawn;

var GitCommander = function(path) {
	this.$busy = false;
	this.$tasks = [];
	this.$proc = null;
	this.$path = path;
	var self = this;
};

(function() {
	this.$commandStart = 'git';

	this.$exec = function() {
		if (!this.$tasks.length || this.$proc)
			return;
			
		var nextTask = this.$tasks.pop();
		var options = { 
			encoding: 'utf8',
			timeout: 0,
			maxBuffer: 2000*1024,
			killSignal: 'SIGTERM',
			cwd: this.$path,
			env: null 
		};
  
		var self = this;
	
		if (nextTask.simpleCallback) {				
			// simple task
			this.$proc = exec(this.$commandStart + nextTask.command, options,
			  function (error, stdout, stderr) {
				nextTask.simpleCallback(error, stdout, stderr);
				self.$proc = null;
				self.$exec();
			});
		}	
		else if (nextTask.progressCallback) {
			// task with progress callback
			var options = { 
					cwd: this.$path,
					env: process.env,
					customFds: [-1, -1, -1],
					setsid: false
			};
			var stderr = "";
			this.$proc = spawn(this.$commandStart, 
				nextTask.command.split(" "), options);	

			this.$proc.stdout.on('data', function (data) {
				nextTask.progressCallback(null, data.toString(), null, false);
			});

			this.$proc.stderr.on('data', function (data) {
				stderr += data;
			});

			this.$proc.on('exit', function (code, signal) {
				if (code === 0 && signal === null) {
					nextTask.progressCallback(null, null, stderr, true);					
				} 
				else {
					var e = new Error('Command failed: ' + stderr);
					e.code = code;
					e.signal = signal;
					nextTask.progressCallback(e, null, stderr, true);
				}
				stderr = "";
				self.$proc = null;
				self.$exec();
			});
		}
	}

	this.killCurrent = function(){
	
	}
	
	this.resetStack = function(){
	
	}
	
	this.add = function(task){
		this.$tasks.push(task);
		this.$exec();
	}
	
}).call(GitCommander.prototype);


var GitRepo = function(path) {
	this.$commander = new GitCommander(path);
	var self = this;
};

(function() {
	this.init = function(callback) {
		this.$commander.add(simpleCommand(' init --quiet', callback));
	}
	this.add = function(file, callback) {
		this.$commander.add(simpleCommand(' add ' + file, callback));
	}
	this.reset = function(file, callback) {
		this.$commander.add(simpleCommand(' reset ' + file, callback));
	}	
	this.commit = function(message, callback) {
		this.$commander.add(simpleCommand(' commit --quiet -m"' + message + '"', callback));	
	}		
	this.fetch = function(callback) {
		this.$commander.add(simpleCommand(' fetch --quiet', callback));	
	}
	this.pull = function(callback) {
		var self = this;
		this.$commander.add({
			command: ' fetch', 
			simpleCallback: function(error, stdout, stderr) {
				if (!error)
					self.merge(callback);
				else
					callback(error||parseStderr(stderr));
			}
		});		
	}		
	this.push = function(callback) {
		this.$commander.add(simpleCommand(' push origin master', callback));
	}	
	this.clone = function(url, callback) {
		this.$commander.add(simpleCommand(' clone ' + url + ' ./', callback));
	}
	// the entry that starts with '*' is the active
	this.listBranches = function(callback) {
		this.$commander.add(simpleCommand(' branch', callback));			
	}
	// origin/HEAD -> origin/master
	this.listRemotes = function(callback) {
		this.$commander.add(simpleCommand(' branch -r', callback));		
	}
	this.createBranch = function(branch, callback) {
		this.$commander.add(simpleCommand(' branch ' + branch, callback));			
	}
	this.createRemoteBranch = function(branch, callback) {
		this.$commander.add(simpleCommand(' push origin origin:refs/heads/', callback));			
	}
	this.trackRemoteBranch = function(branch, callback) {
		this.$commander.add(simpleCommand(' checkout --track -b ' + branch + ' origin/' + branch, callback));			
	}		
	this.deleteBranch = function(branch, callback) {
		this.$commander.add(simpleCommand( ' branch -d ' + branch, callback));			
	}		
	this.switchToBranch = function(branch, callback) {
		this.$commander.add(simpleCommand(' checkout ' + branch, callback));				
	}
	this.createTag = function(tag, hash, callback) {
		if (typeof(hash)=="function") {
			callback = hash;
			hash = '';
		}
		this.$commander.add(simpleCommand(' tag ' + tag + ' ' + hash, callback));			
	}	
	this.removeTag = function(tag, callback) {
		this.$commander.add(simpleCommand(' tag -d ' + tag, callback));			
	}
	this.listTags = function(branch, callback) {
		this.$commander.add(simpleCommand(' branch ' + branch, callback));			
	}
	this.listChanges = function(callback) {
		this.$listChanges(false, false, false, callback);
	}
	this.listStagedChanges = function(callback) {
		this.$listChanges(true, false, false, callback);
	}
	this.listCommitChanges = function(commit1, commit2, callback) {
		this.$listChanges(false, commit1, commit2, callback);
	}
	this.$listChanges = function(staged, commit1, commit2, callback) {
		var entries=[];
		var self = this;
		this.$commander.add({
			command: ' diff --name-status' 
				+ (staged ? ' --cached' : '') 
				+ (commit1 ? (' ' + commit1 + ' ' + commit2) : ''),
			simpleCallback: function(error, stdout, stderr) {				
				// TODO: C R comes with percentage
				stdout.replace(/([ACDMRTUXB])\t([^\n]+)[\n]/g,
					function(token, s, n) {
						entries.push({status: s, name: n});	
						return '';
					}
				);
				if (!staged && !error)
					self.$commander.add({
						// git diff does not list untracked file we need
						// git list for that
						command: ' ls-files -o',
						simpleCallback: function(error, stdout, stderr) {
							var newFiles = stdout.split('\n');
							newFiles.forEach(function(v){
								if (v.length)
									entries.push({status: 'N', name: v});
							});
							callback(error ? error : parseStderr(stderr), entries, true);
						}		
					});
				else	
					callback(error ? error : parseStderr(stderr), entries, true);
			}
		});			
	}	
	this.diff = function(path, callback) {
		this.diffCommits(false, false, path, callback);
	}		
	this.diffCommits = function(commit1, commit2, path, callback) {
		this.$commander.add({
			command: ' diff ' + (commit1 ? (commit1 + ' ' + commit2 + ' -- ') : '')
				+ path,
			simpleCallback: function(error, stdout, stderr) {
				var i = stdout.indexOf('@@');
				callback(error ? error : parseStderr(stderr), i>-1? stdout.substring(i) : stdout, true);
			}
		});			
	}	
	this.merge = function(branch, callback) {
		if ( typeof(branch)=="function") {
			//branch is optional
			callback = branch;
			branch = 'FETCH_HEAD';
		}	

		this.$commander.add({
			command: ' merge ' + branch, 
			simpleCallback: function(error, stdout, stderr) {
				log(stdout);
				var conflicts = [], i = stdout.replace(/(CONFLICT [^\n]+)\n/g, 
					function(token, conflict){
						conflicts.push(conflict);
					});
				
				callback(error||parseStderr(stderr), conflicts);
			}
		});			
	}
	this.logHistory = function(callback) {
		var buffer="", treeSlice = new GitTreeSlice(1);				
		this.$commander.add({
			command: 'log --date-order --graph --no-color --pretty=format:$author:%an$date:%cd$subject:%s$sha:%H$parent:%P$',
			progressCallback: function(error, stdout, stderr, finished) {
				var entries=[];
				buffer = (buffer + stdout).replace(/([ \|\/\n\\*]+)\$author:([^\n]+)\$date:([^\n]+)\$subject:([^\n]+)\$sha:([^\n]+)\$parent:([^\n]+)\$\n/g,
					function(token, treeInfo, author, date, subject, sha, parent) {
						treeSlice.progress(treeInfo.split("\n"));						
						entries.push({
							treeInfo: treeSlice,
							author: author,
							date: date,
							subject: subject,
							hash: sha,
							parent: parent.split(" ")
						});				
						treeSlice = new GitTreeSlice(treeSlice.branches.length);		
						return '';						
					}
				);
				
				callback(error ? error : parseStderr(stderr), entries, finished);
			}
		});			
	}
	function parseStderr(stderr){
		if (!stderr)
			return null;
		var err = [];
		stderr.replace(/warning: ([^\n]+\n)/g, function(token, w){
			return '';
		}).replace(/error: ([^\n]+\n)/g, function(token, e){
			return err.push(e);
		});
		return err.length ? new Error(err.join('')) : null;
	}
	function simpleCommand(command, callback) {
		return {
			command: command, 
			simpleCallback: function(error, stdout, stderr) {
				callback(error||parseStderr(stderr));
			}
		}
	}
}).call(GitRepo.prototype);


var GitTreeSlice = function(length) {
		this.branches = [];
		for (var i=0; i<length; i++) 
			this.branches[i] = [i];
};

(function() {
	this.push = function(idx,elem) {
		if (elem !== undefined)
			(this.branches[idx] ? this.branches[idx] : this.branches[idx] = []).push(elem);	
	}
	this.pop = function(idx) {
		return this.branches[idx] ? this.branches[idx].pop() : undefined;
	}
	this.shift = function(idx) {
		return this.branches[idx] ? this.branches[idx].shift() : undefined;
	}
	this.eraseTail = function() {
		for (var i=this.branches.length-1; i>=0; i--) {
			if (this.branches[i].length == 0)
				this.branches.pop();
			else
				break;	
		}
	}	
	this.progress = function(slices) {
		var self = this;		
		for (var s=0; s<slices.length-1; s++) {
			var i=0;
			slices[s].replace(/([ \/\|\\][ \/\|\\])(?=[^\n])/g, 
				function(token, piece){
					switch (piece) {
						case '  ': self.shift(i); break;						
						case '| ': break;
						case ' \\': self.push(i+1,self.shift(i)); break;
						case '|\\': self.push(i+1, i); break;
						case '|/': self.push(i, self.pop(i+1)); break;
						case ' /': self.pop(i); self.push(i, self.pop(i+1)); break;
						default : console.log('Unexpected tree slice token:['+ piece + ']');
					}
					i++;	
					return '';
				});
		}	
		this.eraseTail();
		console.log(this.branches)
	}
}).call(GitTreeSlice.prototype);

//}

var fs = require('fs');

var r0 = new GitRepo('./t0.git');
var r1 = new GitRepo('./t1');
var r2 = new GitRepo('./t2');
var r3 = new GitRepo('./t3');

var log = console.log;

function test1(){
	r1.clone(process.cwd() + '/t0.git', function(error){
		log("test1");
		if (error) {log(error); return;}		
		log("r1 inited");
		fs.writeFileSync('./t1/file1','some data\nsome more\n42\n');
		fs.writeFileSync('./t1/file2','some data\nsome more\n42\n');
		r1.listChanges(function(error, entries){
			if (error) {log(error); return;}				
			log("changes: ");
			log(entries);
			r1.listStagedChanges(function(error, entries){	
				log("staged changes: ");
				log(error);
				r1.add('./file1',function(error){				
					if (error) {log(error); return;}
					log("file1 added");
					r1.commit('first file', function(error){ 
						if (error) {log(error); return;}
						log("file1 commited")
						r1.listChanges(function(error, entries){
							if (error) {log(error); return;}								
							log("changes: ");
							log(entries);					
							r1.add('./file2',function(error){					
								if (error) {log(error); return;}
								log("file2 added");
								r1.listStagedChanges(function(error, entries){
									if (error) {log(error); return;}								
									log("staged changes: ");
									log(entries);
									r1.commit('second commit',function(error){
										if (error) {log(error); return;}							
										log("commited");
										r1.push(function(error){
											if (error) {log(error); return;}
											test2();
										});										
									});
								});	
							});	
						});
					});	
				});
			});	
		});
	});
};
	
	
function test2(){
	log("test2");
	r2.clone(process.cwd() + '/t0.git', function(error){
		if (error) {log(error); return;}
		log("cloning into t2");
		r3.clone(process.cwd() + '/t0.git', function(error){
			if (error) {log(error); return;}
			fs.writeFileSync('./t2/file1','change1\nsome 11111 more\n42\n');
			fs.writeFileSync('./t2/file2','change2some data\nso22222me more\n42\n');		
			fs.writeFileSync('./t3/file1','schange4ome data\ns43ome33333 mo3333re\n42\n');
			fs.writeFileSync('./t3/file2','blahblahblah');
			log('changed files');
			r3.diff('./file1', function(error, changes) {
				if (error) {log(error); return;}
				log('changes in t3/file1:');
				log(changes);
				r3.diff('./file2', function(error, changes) {
					if (error) {log(error); return;}
					log('changes in t3/file2:');
					log(changes);				
					r2.add('./file1 ./file2', function(error){
						if (error) {log(error); return;}
						log('added changes');
						r2.commit('changes from test2', function(error){
							r2.push(function(error){
								log('commit changes');
								test3();		
							});
						});
					});	
				});
			});			
		});
	});
};

function test3(){
	log('test3');
	r3.add('./file1 ./file2', function(error) {
		if (error) {log(error); return;}
		log('added files');
		r3.commit('changes from test3', function(error){
			if (error) {log(error); return;}
			log('commit changes');
			r3.pull(function(error, conflicts){
				//if (error) {log(error); return;}
				log('conflicts:')
				log(conflicts);
				r3.listChanges(function(error, entries){
					if (error) {log(error); return;}
					log(entries);
					fs.writeFileSync('./t3/file1','blah finished');
					fs.writeFileSync('./t3/file2','blah finished');				
					r3.add('./file1 ./file2', function(error, entries){
						if (error) {log(error); return;}
						r3.commit('last commit', function(error){
							if (error) {log(error); return;}
							r3.logHistory(function(error, entries, finished){
								if (error) {log(error); return;}
								log(entries);
								if (entries.length > 0)
									r3.listCommitChanges(entries[1].parent, entries[1].hash, function(error, fileentries){
										if (error) {log(error); return;}
										log(fileentries);
										r3.diffCommits(entries[1].parent, entries[1].hash, fileentries[0].name, function(error, diff){
											if (error) {log(error); return;}
											log(diff);
											test4();
										});
									});
								if (finished)
									log('FINISHED. (history)');
							});
						});
					}); 
				});
			});		
		});							
	});
};

function test4(){
	
}

//test1();

//var repo = new GitRepo('/cygdrive/c/development/o3/o3');

//repo.listChanges(false, function(error, entries, finished) {
//	console.log(error);
//	if (entries)
//		for (var v=0; v<entries.length; v++)
//			console.log(entries[v]);
//});

//repo.logHistory(function(error, entries, finished) {
//	if (entries)
//		for (var v=0; v<entries.length; v++)
//			console.log(entries[v].treeInfo);
//	
//});

//repo.diffCommits("caf3357e868b4e5014d55d50f4f4fc00c19729de", "110a818a8343d83e3ee524093add86c08ff347e9", function(error, entries, finished) {
	
//});


