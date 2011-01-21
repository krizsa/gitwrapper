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
		this.$commander.add({
			command: ' init --quiet', 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});
	}
	this.add = function(file, callback) {
		this.$commander.add({
			command: ' add', 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});	
	}
	this.commit = function(message, callback) {
		this.$commander.add({
			command: ' commit --quiet -m"' + message + '"', 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});			
	}		
	// the entry that starts with '*' is the active
	this.listBranches = function(callback) {
		this.$commander.add({
			command: ' branch', 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr, stdout.split('\n'));
			}
		});				
	}
	// origin/HEAD -> origin/master
	this.listRemotes = function(callback) {
		this.$commander.add({
			command: ' branch -r', 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr, stdout.split('\n'));
			}
		});				
	}
	this.createBranch = function(branch, callback) {
		this.$commander.add({
			command: ' branch ' + branch, 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});					
	}	
	this.deleteBranch = function(branch, callback) {
		this.$commander.add({
			command: ' branch -d ' + branch, 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});					
	}		
	this.switchToBranch = function(branch, callback) {
		this.$commander.add({
			command: ' checkout ' + branch, 
			simpleCallback: function(error, stdout, stderr) {
				callback(error|stderr);
			}
		});					
	}	
	//this.fetch = function()
	this.listChanges = function(callback) {
		$listChanges(false, false, false, callback);
	}

	this.listStagedChanges = function(callback) {
		$listChanges(true, false, false, callback);
	}

	this.listCommitChanges = function(commit1, commit2, callback) {
		$listChanges(false, commit1, commit2, callback);
	}
	
	this.$listChanges = function(staged, commit1, commit2, callback) {
		this.$commander.add({
			command: ' diff --name-status' 
				+ staged ? ' --cached' : ''
				+ (commit1&&commit2) ? (' ' + commit1 + ' ' commit2) : '',
			simpleCallback: function(error, stdout, stderr) {
				var entries=[];
				// TODO: C R comes with percentage
				stdout.replace(/([ACDMRTUXB])\t([^\n]+)[\n]/g,
					function(token, s, n) {
						entries.push({status: s, name: n});	
						return '';
					}
				);
				callback(error ? error : stderr, entries, true);
			}
		});			
	}
	
	this.diffCommits = function(commit1, commit2, path, callback) {
		this.$commander.add({
			command: ' diff ' + commit1 + ' ' + commit2 + ' -- ' + path,
			simpleCallback: function(error, stdout, stderr) {
				var i = stdout.indexOf('@@');
				callback(error ? error : stderr, i>-1? stdout.substring(i) : stdout, true);
			}
		});			
	}	
	
	this.merge = function(branch, callback) {
		if ( typeof(branch)="function") {
			//branch is optional
			callback = branch;
			branch = 'FETCH_HEAD';
		}	
		this.$commander.add({
			command: ' merge ' + branch, 
			simpleCallback: function(error, stdout, stderr) {
				var conflict, i = stdout.indexOf('\nCONFLICT ');
				if (i>-1) {
					conflict = stdout.substring(i+1)
				}
				callback(error|stderr|conflict);
			}
		});			
	}
	
	this.logHistory = function(callback) {
		var buffer="", treeSlice = new GitTreeSlice(1);				
		this.$commander.add({
			command: 'log --date-order --graph --no-color --pretty=format:$author:%an$date:%cd$subject:%s$sha:%H$parent:%P$',
			progressCallback: function(error, stdout, stderr, finished) {
				var entries=[];
				if (error)
					console.log(error);
				if (finished)
					console.log(finished)
				var entries=[];
				console.log(stdout);
				buffer = (buffer + stdout).replace(/([ \|\/\n\\*]+)\$author:([^\n]+)\$date:([^\n]+)\$subject:([^\n]+)\$sha:([^\n]+)\$parent:([^\n]+)\$\n/g,
					function(token, treeInfo, author, date, subject, sha, parent) {
						console.log("info: " + treeInfo);
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
				
				callback(error ? error : stderr, entries, finished);
			}
		});			
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

var repo = new GitRepo('/cygdrive/c/development/o3/o3');

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

repo.diffCommits("caf3357e868b4e5014d55d50f4f4fc00c19729de", "110a818a8343d83e3ee524093add86c08ff347e9", function(error, entries, finished) {
	
});

