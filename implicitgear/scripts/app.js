var _app = undefined; //for debugging purposes only.  don't write code with it

define([
  "util", "mesh", "mesh_tools", "mesh_editor", "const", "simple_toolsys",
  "transform", "events", "implicitgear", "dat"
], function (util, mesh, mesh_tools, mesh_editor, cconst, toolsys,
  transform, events, implicitgear, unused) {
  'use strict';

  var exports = _app = {};

  window.STARTUP_FILE_NAME = "startup_file_implicitgear";
  window.GRAPHICAL_TEST_MODE = true
  window.GRAPHICAL_TEST_OFFSET = 350.0;
  window.GRAPHICAL_TEST_SCALE = 40.0;
  window.SHOW_CURRENT_TRAP = false;

  var AppState = exports.AppState = class AppState extends events.EventHandler {
    constructor() {
      super();

      this.showCurrentTrap = false;

      this.last_save = 0;
      this.canvas = document.getElementById("canvas2d");
      this.g = this.canvas.getContext("2d");
      this.mesh = new mesh.Mesh();

      this.ctx = new toolsys.Context();
      this.toolstack = new toolsys.ToolStack();
      this.editor = new mesh_editor.MeshEditor();
      this.igear = undefined;

      this.numteeth = 8;
      this.depth = 2.0;
      this.modulus = 2.0;
      this.backlash = -0.1 * 4;
      this.pressure = 20.0;
      this.resolution = 128;

      this.drawGrid = false;
      this.drawImage = false;

      this.cache = new implicitgear.GearCache();

      this.reset();
      this.makeGUI();
    }

    reset(args={}) {
      window.SHOW_CURRENT_TRAP = this.showCurrentTrap;
      
      let numteeth = args.numteeth ?? this.numteeth;
      let pressure = args.pressure ?? this.pressure;
      let backlash = args.backlash ?? this.backlash;
      let depth = args.depth ?? this.depth;
      let modulus = args.modulus ?? this.modulus;

      let profile = this.profile = new implicitgear.Profile(numteeth, this.modulus);

      console.log(this.numteeth);

      profile.pressureth = pressure / 180.0 * Math.PI;
      profile.backlash = backlash;
      profile.depth *= depth

      this.igear = new implicitgear.ImplicitGear(this.g, profile, this.resolution);

      this.igear.run(this);
    }

    makeGUI() {
      this.dat = new dat.GUI();

      let check = (prop, autoReset = false) => {
        this[prop] = !!this[prop];

        let chg = () => {
          if (autoReset) {
            this.reset();
          }

          window.redraw_all();
        }

        return this.dat.add(this, prop).listen().onChange(chg);
      }

      let slider = (prop, isInt, min, max, step = 0.1) => {
        let chg = () => {
          console.log(prop, this[prop])

          if (isInt) {
            this[prop] = Math.floor(this[prop]);
          }

          this.reset();
          window.redraw_all();
        }

        return this.dat.add(this, prop).min(min).max(max).step(step).listen().onChange(chg);
      }

      slider("resolution", true, 2, 256, 1);
      slider("numteeth", true, 2, 50, 1);
      slider("modulus", false, 0.1, 5.0, 0.1);
      slider("depth", false, 1.0, 2.5, 0.1);
      slider("pressure", false, 1, 50, 1);
      slider("backlash", false, -0.25, 0.25, 0.005);

      check("drawGrid");
      check("drawImage");
      check("showCurrentTrap", true);
    }

    setsize() {
      var w = window.innerWidth, h = window.innerHeight;

      var eventfire = this.canvas.width != w || this.canvas.height != h;

      if (this.canvas.width != w)
        this.canvas.width = w;
      if (this.canvas.height != h)
        this.canvas.height = h;

      if (eventfire)
        this.on_resize([w, h]);
    }

    draw() {
      this.setsize();
      this.g.clearRect(0, 0, this.canvas.width, this.canvas.height);

      if (window.SHOW_CURRENT_TRAP) {
        this.reset();
      }
      
      window.T = window.T !== undefined ? window.T + 0.05 : 1.0;

      let g = this.g;

      g.save();
      g.scale(0.5, 0.5);

      for (let i = 0; i < 2; i++) {
        g.save();

        let sign = i * 2.0 - 1.0;
        let dth = 0.0;

        if (i === 1) {
          dth = Math.PI * 2.0 / this.numteeth * 0.5;
        }

        this.igear.rotateCanvas(g, sign * T * 0.1 + dth, i);
        this.igear.draw(this.canvas, g, this.drawImage, this.drawGrid);
        this.editor.draw(this.ctx, this.canvas, g);

        g.restore();
      }

      g.restore();

      this.cache.draw(this.canvas, g);

      //XXX
      window.redraw_all();
    }

    save() {
      return JSON.stringify(this);
    }

    load(str) {
      this.loadJSON(JSON.parse(str));
      return this;
    }

    toJSON() {
      const { modulus, pressure, resolution,
        depth, backlash, numteeth, drawGrid,
        drawImage, cache, showCurrentTrap
      } = this;

      return {
        version: cconst.APP_VERSION,
        mesh: this.mesh,
        modulus, pressure, depth, backlash, numteeth,
        drawGrid, drawImage, resolution,
        cache, showCurrentTrap
      };
    }

    loadJSON(obj) {
      this.mesh = new mesh.Mesh();
      this.mesh.loadJSON(obj.mesh);

      this.pressure = obj.pressure ?? this.pressure;
      this.modulus = obj.modulus ?? this.modulus;
      this.depth = obj.depth ?? this.depth;
      this.backlash = obj.backlash ?? this.backlash;
      this.numteeth = obj.numteeth ?? this.numteeth;
      this.resolution = obj.resolution ?? this.resolution;

      this.drawGrid = obj.drawGrid ?? this.drawGrid;
      this.drawImage = obj.drawImage ?? this.drawImage;
      this.showCurrentTrap = obj.showCurrentTrap ?? false;

      if (obj.cache) {
        try {
          this.cache.loadJSON(obj.cache);
        } catch (error) {
          console.error(error.stack);
          console.error("Failed to load gear curve cache");
        }
      }

      this.reset();

      window.redraw_all();
      return this;
    }

    on_resize(newsize) {
      console.log("resize event");
      this.editor.on_resize(newsize);
    }

    on_mousedown(e) {
      this.editor.on_mousedown(e);
    }

    on_mousemove(e) {
      this.editor.on_mousemove(e);
    }

    on_mouseup(e) {
      this.editor.on_mouseup(e);
    }

    on_tick() {
      this.editor.on_tick();

      if (util.time_ms() - this.last_save > 900) {
        console.log("autosaving");
        localStorage[STARTUP_FILE_NAME] = this.save();

        this.last_save = util.time_ms();
      }
    }

    on_keydown(e) {
      switch (e.keyCode) {
        case 75: //kkey
          this.igear.run(this);
          break;
        case 90: //zkey
          if (e.ctrlKey && e.shiftKey && !e.altKey) {
            this.toolstack.redo();
            window.redraw_all();
          } else if (e.ctrlKey && !e.altKey) {
            this.toolstack.undo();
            window.redraw_all();
          }
          break;
        case 187: //pluskey
        case 189: //minuskey
          this.depthmul += e.keyCode == 187 ? 1 : -1;
          this.depthmul = Math.max(this.depthmul, 1);
          this.profile.depth = (this.profile.modulus * 2 / Math.PI) * this.depthmul;

          /*
          this.numteeth += e.keyCode == 187 ? 1 : -1;
          
          console.log(this.numteeth)
          this.profile.numteeth = this.numteeth;
          this.igear = new implicitgear.ImplicitGear(this.g, this.profile); //new implicitgear.Profile(this.numteeth));
          //*/

          this.igear.run(this);
          break;
        case 89: //ykey
          if (e.ctrlKey && !e.shiftKey && !e.altKey) {
            this.toolstack.redo();
            window.redraw_all();
          }
          break;

        default:
          return this.editor.on_keydown(e);
      }
    }
  }

  function start() {
    window._appstate = new AppState();

    var canvas = document.getElementById("canvas2d");
    _appstate.pushModal(canvas, true);

    var animreq = undefined;
    function dodraw() {
      animreq = undefined;
      _appstate.draw();
    }

    window.redraw_all = function redraw_all() {
      if (animreq !== undefined) {
        return;
      }

      animreq = requestAnimationFrame(dodraw);
    }

    if (STARTUP_FILE_NAME in localStorage) {
      try {
        _appstate.load(localStorage[STARTUP_FILE_NAME]);
      } catch (error) {
        util.print_stack(error);
        console.log("failed to load startup file");

        window._appstate = new AppState();
        _appstate.pushModal(canvas, true);

        //make base file
        _appstate.toolstack.execTool(new mesh_tools.CreateDefaultFile());

        console.log("started!");
        window.redraw_all();
      }
    } else {
      //make base file
      _appstate.toolstack.execTool(new mesh_tools.CreateDefaultFile());
      console.log("started!");
      window.redraw_all();
    }

    window.setInterval(function () {
      _appstate.on_tick();
    }, 250);
  }

  start();
  _appstate.igear.run(_appstate);

  return exports;
});
